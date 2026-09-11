FROM node:24-alpine AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
  NPM_CONFIG_FUND=false

FROM base AS deps
COPY package*.json .
RUN npm ci --omit=dev

FROM base AS build
COPY . .
RUN npm ci && npm run compile

FROM base AS dev
COPY . .
RUN npm install && npm run compile

EXPOSE 8080
CMD ["npm" ,"run", "dev"]

FROM base AS runtime
ENV NODE_ENV=production \
  PORT=3000


RUN addgroup -S -g 10001 nodeapp && adduser -S -u 10001 nodeapp -G nodeapp && \
  apk upgrade --no-cache && \
  apk add --no-cache tini=0.19.0-r3

COPY --chown=nodeapp:nodeapp package.json ./
COPY --from=build --chown=nodeapp:nodeapp /app/dist ./dist
COPY --from=deps --chown=nodeapp:nodeapp /app/node_modules ./node_modules
COPY NOTICES.md .

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

USER nodeapp
EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1


ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/expand-file-secrets.sh"]
CMD ["node", "dist/start.js"]
