# syntax=docker/dockerfile:1

# Étape 1 : construction
FROM node:22-slim AS build

WORKDIR /build

# pnpm épinglé via corepack (aligné sur le champ packageManager)
RUN corepack enable && corepack prepare pnpm@10.6.5 --activate

# Manifestes + lockfile d'abord, pour profiter du cache de couches
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json ./apps/client/
COPY apps/server/package.json ./apps/server/
RUN pnpm install --frozen-lockfile

COPY apps ./apps/
RUN pnpm run build

# Étape 2 : image d'exécution
FROM node:22-slim AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.6.5 --activate

COPY --from=build /build/package.json /build/pnpm-lock.yaml /build/pnpm-workspace.yaml ./
COPY --from=build /build/apps/client/package.json ./apps/client/
COPY --from=build /build/apps/server/package.json ./apps/server/

# Dépendances de production du serveur uniquement
RUN pnpm install --filter=server --prod --frozen-lockfile && pnpm store prune

COPY --from=build /build/apps/client/dist ./apps/client/dist/
COPY --from=build /build/apps/server/dist ./apps/server/dist/
# Migrations SQLite, appliquées au démarrage
COPY --from=build /build/apps/server/drizzle ./apps/server/drizzle/

EXPOSE 3001
ENV DATA_PATH=/config

# Utilisateur non privilégié (fourni par l'image node)
RUN mkdir -p /config && chown -R node:node /app /config
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://localhost:3001/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "run", "start"]
