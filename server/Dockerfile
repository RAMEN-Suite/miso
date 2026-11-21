FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
  NPM_CONFIG_FUND=false

FROM base AS deps
COPY server/package*.json server/.npmrc ./
RUN npm ci --omit=dev

# Local development only (compose.yml target dev): tsc --watch and nodemon on the synced sources
FROM base AS dev
ENV NODE_ENV=development
COPY server/package*.json server/.npmrc ./
RUN npm ci
COPY server .
RUN npm run compile
EXPOSE 8080
CMD ["npm", "run", "dev"]

FROM base AS build
COPY server .
RUN npm ci && npm run compile

FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS runtime
WORKDIR /app
ENV NODE_ENV=production \
  PORT=3000

RUN addgroup -S -g 10001 nodeapp && adduser -S -u 10001 nodeapp -G nodeapp && \
  apk add --no-cache tini=0.19.0-r3

COPY --from=deps --chown=nodeapp:nodeapp /app/node_modules ./node_modules
COPY --from=build --chown=nodeapp:nodeapp /app/dist ./dist
COPY --from=build --chown=nodeapp:nodeapp /app/package.json .
COPY server/NOTICES.md .

RUN cat > /usr/local/bin/expand-file-secrets.sh <<'EOF' \
  && chmod 0555 /usr/local/bin/expand-file-secrets.sh
#!/bin/sh
set -eu
for _name in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)_FILE=.*/\1/p'); do
  eval "_path=\${${_name}_FILE}"
  _value="$(cat "$_path" 2>/dev/null || true)"
  if [ -n "$_value" ]; then
    export "${_name}=${_value}"
    unset "${_name}_FILE"
  else
    echo "expand-file-secrets: ${_name}_FILE=${_path} unreadable or empty, leaving ${_name} alone" >&2
  fi
done
unset _name _path _value

exec "$@"
EOF

EXPOSE 3000
USER 10001:10001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/bin/sh", "-c", "wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1"]

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/expand-file-secrets.sh"]
CMD ["node", "dist/start.js"]
