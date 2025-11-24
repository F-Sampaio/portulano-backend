FROM node:20-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache \
    openssl \
    libc6-compat

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5000

RUN npx prisma generate

CMD ["node", "src/app.js"]
