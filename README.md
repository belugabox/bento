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

Ne jamais modifier ni régénérer une migration qu'une base a pu appliquer, même en local (`pnpm dev` les applique dès qu'elles apparaissent) : Drizzle repère les migrations à jouer par leur date dans `drizzle/meta/_journal.json`, et une base qui l'a déjà appliquée tenterait de la rejouer, le serveur ne démarrerait plus. Toujours en générer une nouvelle.

## Configuration

Toute la configuration passe par des variables d'environnement :

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3001` | Port HTTP |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` ou `error` |
| `DATA_PATH` | `./data` (`/config` dans Docker) | Base SQLite et couvertures |
| `LIBRARIES` | `[]` | Bibliothèques, en JSON : `[{"name":"Mangas","path":"/manga","type":"manga"}]`. Type `manga` ou `comics` : mode de lecture par défaut « Manga (gauche → droite) » ou « BD » |
| `SCAN_INTERVAL_MINUTES` | `30` | Scan automatique des bibliothèques (`0` = seulement au démarrage et à la demande) |
| `OIDC_ISSUER` | — (requis) | Adresse de Pocket ID, ex. `https://auth.belugabox.net` |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | — (requis) | Client OIDC « Bento » créé dans Pocket ID |
| `PUBLIC_URL` | — (requis) | Adresse publique de Bento ; l'adresse de retour à déclarer dans Pocket ID est `PUBLIC_URL/api/auth/callback` |
| `OIDC_ADMIN_GROUP` | `bento-admins` | Groupe Pocket ID des administrateurs |
| `OIDC_READER_GROUP` | `bento-readers` | Groupe Pocket ID des lecteurs (sans l'un des deux groupes, l'accès est refusé) |

### Gestion des tomes (admin)

- **Brouillons** : les tomes déposés dans le dossier `_draft` d'une bibliothèque (par la synchro de beluga-box, par exemple) apparaissent dans « Brouillons » : l'icône en haut à droite indique le nombre de séries en attente. Les `.cbr` et les RAR déguisés en `.cbz` sont convertis au passage.
- **Métadonnées** : on les complète à la main, ou avec « Remplir » : recherche Wikipédia FR pour la série, puis noms de fichiers pour le numéro, le titre (« Tome N ») et l'année de chaque tome (ou les noms de fichiers seuls), avec l'option « Écraser les valeurs existantes ». « Publier » range chaque tome en `Série/Série #NN (Année).cbz` ; un brouillon remplace le tome publié du même numéro.
- **Statut et mode de lecture** : une série est « en cours de parution » ou « terminée » ; son mode de lecture (BD, manga, webtoon) remplace celui de la bibliothèque. Les deux se règlent dans l'éditeur, dès les brouillons (ils sont appliqués à la série à la publication) ; le statut se remplit aussi depuis Wikipédia.
- **Séries publiées** : « Modifier les métadonnées » sur la fiche série. Si la série est renommée, « Renommer les fichiers » déplace les tomes, sans perdre la progression de lecture.
- **Compression** : « Compresser… » estime le gain (sur quelques pages), puis recompresse les pages en arrière-plan sur le serveur : par défaut 2400 px de haut au plus, JPEG qualité 90 (modifiable dans les réglages). Un fichier n'est réécrit que s'il y gagne ; le ComicInfo est gardé. Sur un vrai tome de 258 Mo : −43 % en une trentaine de secondes (−52 % en qualité 85).
- **Aperçu de lecture** : l'œil à côté du mode de lecture (ou de chaque tome) ouvre le tome dans le lecteur, dans le mode choisi, sans quitter l'éditeur. On y essaie les autres modes ; « Garder » reprend celui essayé dans l'éditeur (à enregistrer).
- **Couverture** : celle d'un tome, une page au choix, une image de l'appareil (choisie, déposée ou collée) ou l'image de l'article Wikipédia, avec un aperçu et un cadrage (haut, centre ou bas). Elle se choisit aussi dès les brouillons.
- **Articles** : le tri des séries ignore l'article en tête (« Le », « La », « Les », « L' », « Un », « Une », « Des », « The », « A », « An ») : « L'Attaque des Titans » est rangée à A. Le nom affiché ne change pas. Un nom de fichier « Boxer (The) T01 » donne la série « The Boxer ».

Bento écrit dans les fichiers (ComicInfo, rangement) : le conteneur doit pouvoir écrire dans les dossiers des bibliothèques.

### Modes de lecture

- **BD** : de gauche à droite.
- **Manga (gauche → droite)** : on tourne les pages vers la droite, mais en double page la première page est à droite, comme dans un manga.
- **Manga (droite → gauche)** : sens japonais, y compris pour tourner les pages.
- **Webtoon** : toutes les pages à la suite, en défilement vertical.

L'admin fixe le mode de chaque série dans « Modifier les métadonnées » (par défaut : manga de gauche à droite pour une bibliothèque de mangas, BD sinon) ; chacun peut le changer pour lui-même dans les réglages du lecteur.

### Accueil, listes et collections

- **Accueil** : « Reprendre la lecture » (tomes commencés), « La suite de tes séries » (le premier tome pas encore ouvert des séries dont on a fini un tome), « Nouveautés » (le dernier tome ajouté de chaque série), puis toutes les séries.
- **Filtres** : état de lecture, liste (toutes, mes favoris, à lire, une collection), genre, statut de parution ; et le tri par nom ou par ajouts récents. Tout reste dans l'adresse.
- **Favoris et « À lire »** : le cœur et le marque-page de la fiche série, propres à chacun.
- **Collections** : des sélections partagées créées par l'admin (menu de l'avatar, « Collections »), visibles de tous selon leur contrôle parental. Une série s'y ajoute depuis le menu ⋯ de sa fiche. Listes et collections suivent une série renommée à la publication.

### Réglages (admin)

Depuis le menu de l'avatar, « Réglages » : qualité JPEG et hauteur maximale des pages pour la compression, et intervalle du scan automatique (la variable `SCAN_INTERVAL_MINUTES` n'en donne plus que la valeur par défaut). Les réglages sont gardés en base et s'appliquent tout de suite.

### Apparence

Chacun choisit, depuis le menu de l'avatar (« Apparence… »), le mode clair, sombre ou celui du système, et une couleur d'accent parmi douze. Le réglage est gardé sur l'appareil.

### Statistiques (admin)

Depuis le menu de l'avatar : chiffres de la bibliothèque, lecture par personne, activité récente, séries les plus lues, séries par tranche d'âge (et sans classification), statut des séries, et le bouton de scan de chaque bibliothèque.

### Contrôle parental

- **Âge maximal** : l'admin le règle pour chaque personne dans « Comptes et contrôle parental », depuis le menu de l'avatar.
- **Classification d'une série** : toujours la plus restrictive de ses tomes (`AgeRating` du ComicInfo). Pour la changer, on modifie la classification des tomes dans l'éditeur de métadonnées.
- **Comptes limités** : ils ne voient que les séries classées sous leur limite. Une série sans classification leur est masquée, partout : liste, fiche, tomes, pages, couvertures, « Reprendre la lecture ».
- **Admins** : ils voient tout. « Voir comme un lecteur… », dans le menu de l'avatar, leur permet de **voir l'appli comme un lecteur** d'un âge donné, pour vérifier ce qu'un enfant verra ; un bandeau permet de revenir à la vue admin.
- **Classifications** : les variantes du ComicInfo sont regroupées par âge (« 10 ans et + » regroupe « Everyone 10+ » et « PG », par exemple).

### Connexion

La connexion passe par Pocket ID, en OIDC : flux par code avec PKCE, côté serveur. Bento garde ensuite une session de 30 jours dans un cookie `HttpOnly`, prolongée tant qu'elle sert. Nom, e-mail et rôle sont repris de Pocket ID à chaque connexion. Seuls `/api/health` et `/api/auth/*` sont accessibles sans session.

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
      PUBLIC_URL: https://bento.belugabox.net
      OIDC_ISSUER: https://auth.belugabox.net
      OIDC_CLIENT_ID: ${BENTO_OIDC_CLIENT_ID}
      OIDC_CLIENT_SECRET: ${BENTO_OIDC_CLIENT_SECRET}
    volumes:
      - ./bento:/config
      - /BLK/Books/Manga:/manga
```

Le conteneur tourne avec l'utilisateur `node` : il doit pouvoir écrire dans `/config` et dans les dossiers des bibliothèques (gestion des tomes).
