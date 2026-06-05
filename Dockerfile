FROM node:20-slim

WORKDIR /app

# Pula download do Chrome bundled — usamos o chromium do sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN apt-get update && apt-get install -y \
    openssl ca-certificates bash curl python3 build-essential \
    chromium \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 3000
EXPOSE 5555

CMD ["npm", "run", "start:dev"]