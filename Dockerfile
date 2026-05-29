FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    bash \
    curl \
    git \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

EXPOSE 3000

CMD ["sh", "-c", "npx prisma generate && npm run start:dev"]