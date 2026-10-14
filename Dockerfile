FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack prepare pnpm@11.24.0 --activate && pnpm install --prod --frozen-lockfile
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
