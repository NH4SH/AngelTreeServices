FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
WORKDIR /app
COPY bridge.mjs token.mjs probe.mjs ./
USER 1000:1000
CMD ["node", "--max-old-space-size=128", "--max-http-header-size=8192", "bridge.mjs"]
