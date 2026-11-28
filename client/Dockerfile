FROM node:26.13.0-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
  NPM_CONFIG_FUND=false

# Local development only (compose.yml target dev): Vite dev server on the synced sources, /api proxied to backend
FROM base AS dev
ENV NODE_ENV=development
COPY client/package*.json client/.npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY client .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

FROM base AS build
COPY client .
RUN npm ci \
  && npm run build

FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b AS caddy
RUN setcap -r /usr/bin/caddy

FROM alpine:3@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf AS runtime
WORKDIR /app
ENV XDG_CONFIG_HOME=/config \
  XDG_DATA_HOME=/data

RUN addgroup -S -g 10001 webuser \
  && adduser -S -u 10001 webuser -G webuser \
  && apk add --no-cache mailcap=2.1.54-r0 \
  && mkdir -p /etc/caddy /usr/share/caddy

COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY --from=build --chown=webuser:webuser /app/dist /usr/share/caddy
COPY client/NOTICES.md .

RUN cat > /etc/caddy/Caddyfile <<'EOF'
{
    admin off
    persist_config off
}
:8080 {
    root * /usr/share/caddy
    encode gzip
    try_files {path} {path}/ /index.html
    file_server
}
EOF


USER 10001:10001
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/bin/sh", "-c", "wget -q -O /dev/null http://127.0.0.1:8080 || exit 1"]

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
