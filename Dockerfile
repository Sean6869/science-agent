FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY *.mjs quizzes.json ./
COPY public ./public
ENV NODE_ENV=production
EXPOSE 4173
CMD ["node", "server.mjs"]
