# =============================================================
# API de gestion de restaurant — image de production
# Ce fichier vit à la racine parce que la construction a besoin de voir
# `backend/` ET `database/` : les migrations SQL sont embarquées dans l'image.
# =============================================================

# ---------- Étape 1 : compilation TypeScript ----------
FROM node:24-alpine AS builder

WORKDIR /app

# Les dépendances sont installées avant le code : tant que package.json
# ne change pas, cette couche reste en cache.
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# Retire les dépendances de développement de node_modules.
RUN npm prune --omit=dev


# ---------- Étape 2 : image finale ----------
FROM node:24-alpine AS runner

# tini gère correctement les signaux (SIGTERM de Render) et les zombies.
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app

# L'application ne tourne pas en root.
RUN addgroup -S api && adduser -S api -G api

COPY --from=builder --chown=api:api /app/node_modules ./node_modules
COPY --from=builder --chown=api:api /app/dist ./dist
COPY --chown=api:api backend/package.json ./package.json

# Les fichiers SQL sont embarqués : le conteneur sait migrer sa propre base.
COPY --chown=api:api database/migrations ./database/migrations

USER api

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
