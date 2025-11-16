FROM node:20-slim

ARG BW_CLI_VERSION=2024.12.0

RUN apt-get update && apt-get install -y curl unzip && rm -rf /var/lib/apt/lists/*

RUN npm install -g @bitwarden/cli

WORKDIR /app

COPY package.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production

CMD ["node","src/index.js"]
