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

Ne jamais modifier une migration déjà commitée : une base qui l'a déjà appliquée tenterait de la rejouer et le serveur ne démarrerait plus. Toujours en générer une nouvelle.

## Configuration

Toute la configuration passe par des variables d'environnement :

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3001` | Port HTTP |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` ou `error` |
| `DATA_PATH` | `./data` (`/config` dans Docker) | Base SQLite et couvertures |
| `LIBRARIES` | `[]` | Bibliothèques, en JSON : `[{"name":"Mangas","path":"/manga","type":"manga"}]`. Type `manga` (lecture de droite à gauche) ou `comics` (de gauche à droite) |
| `SCAN_INTERVAL_MINUTES` | `30` | Scan automatique des bibliothèques (`0` = seulement au démarrage et à la demande) |

### Organisation des bibliothèques

- **Séries** : une série par dossier de premier niveau, par exemple `Spy x Family/Spy x Family #01 (2020).cbz`. Un tome rangé à la racine forme sa propre série, nommée d'après son ComicInfo ou son nom de fichier.
- **Numéro de tome** : il vient du ComicInfo (`Number`), ou à défaut du nom de fichier (`T05`, `Tome 5`, `Vol. 5`, `#05`).
- **Dossiers ignorés** : ceux qui commencent par `_` (comme `_draft`, les brouillons) ou par `.`.

## Déploiement

L'image est publiée sur `ghcr.io/belugabox/bento` à chaque push sur `main`.

```yaml
services:
  bento:
    image: ghcr.io/belugabox/bento:main
    restart: unless-stopped
    ports:
      - '3003:3001'
    environment:
      LIBRARIES: '[{"name":"Mangas","path":"/manga","type":"manga"}]'
    volumes:
      - ./bento:/config
      - /BLK/Books/Manga:/manga
```

Le conteneur tourne avec l'utilisateur `node` : il doit pouvoir écrire dans `/config`. Pour la lecture, un accès en lecture seule aux bibliothèques suffit.
