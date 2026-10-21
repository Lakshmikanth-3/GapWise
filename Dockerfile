FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev
COPY . .
ENV PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "apps/server/server.ts"]
