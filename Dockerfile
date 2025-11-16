FROM node:20-slim

ARG BW_CLI_VERSION=2024.12.0

RUN apt-get update && apt-get install -y curl unzip && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/bw.zip \
        https://github.com/bitwarden/clients/releases/download/cli-v${BW_CLI_VERSION}/bw-linux-${BW_CLI_VERSION}.zip \
    && unzip /tmp/bw.zip -d /usr/local/bin \
    && mv /usr/local/bin/bw /usr/local/bin/bw-cli \
    && chmod +x /usr/local/bin/bw-cli \
    && rm -f /tmp/bw.zip

# (Opcional) manter nome padrão:
RUN ln -s /usr/local/bin/bw-cli /usr/local/bin/bw

WORKDIR /app

COPY package.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production

CMD ["node","src/index.js"]
