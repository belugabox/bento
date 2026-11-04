# 🍱 Bento

Serveur de lecture et de gestion de mangas et BD : la famille y lit, l'admin y prépare et range les tomes. Voir la [spécification](docs/SPEC.md).

## Développement

Prérequis : Node 22 et pnpm 10.

```sh
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm dev
```

- Appli : http://localhost:5173. Le client Vite renvoie `/api` vers le serveur, sur le port 3001.
- Données locales (base SQLite) : `apps/server/data/`, ignoré par Git.
- `pnpm test`, `pnpm lint`, `pnpm build`.

### Base de données

SQLite avec [Drizzle](https://orm.drizzle.team). Le schéma est dans `apps/server/src/db/schema.ts` et les migrations dans `apps/server/drizzle/`. Elles sont appliquées automatiquement au démarrage.

Après une modification du schéma, il faut générer la migration :

```sh
pnpm --filter server db:generate --name <nom>
```

## Configuration

Toute la configuration passe par des variables d'environnement :

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3001` | Port HTTP |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` ou `error` |
| `DATA_PATH` | `./data` (`/config` dans Docker) | Base SQLite et cache |

## Déploiement

L'image est publiée sur `ghcr.io/belugabox/bento` à chaque push sur `main`.

```yaml
services:
  bento:
    image: ghcr.io/belugabox/bento:main
    restart: unless-stopped
    ports:
      - '3003:3001'
    volumes:
      - ./bento:/config
```

Le conteneur tourne avec l'utilisateur `node` : il doit pouvoir écrire dans `/config`.
