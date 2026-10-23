FROM node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
WORKDIR /app
COPY bridge.mjs token.mjs probe.mjs ./
USER 1000:1000
CMD ["node", "--max-old-space-size=128", "--max-http-header-size=8192", "bridge.mjs"]
