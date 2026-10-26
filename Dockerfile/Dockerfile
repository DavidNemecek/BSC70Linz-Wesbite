# Coolify build: compile the Vite application with the pinned Node 24 LTS
# toolchain, then serve only the generated production files with Node.
FROM node:24.22.1-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:24.22.1-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV PUBLIC_ORIGIN=https://www.bsc70linz.at

COPY --from=build /app/dist ./dist
COPY server/coolify.mjs ./server/coolify.mjs

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "server/coolify.mjs"]
