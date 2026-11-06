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

- **Brouillons** : les tomes déposés dans le dossier `_draft` d'une bibliothèque (par la synchro de beluga-box, par exemple) apparaissent dans « Brouillons » : l'icône en haut à droite indique le nombre de séries en attente. Chaque dossier forme une série ; un tome déposé seul à la racine de `_draft` forme la sienne. Les `.cbr` et les RAR déguisés en `.cbz` sont convertis au passage.
- **Série existante** : « Ajouter à une série existante » rattache les tomes d'un brouillon à une série publiée : son nom et ses champs de série sont repris, et les tomes rejoignent son dossier à la publication, même si celui-ci porte un autre nom.
- **Tâches** : l'icône en haut à droite montre les tâches de fond en cours (scan, compression, publication, lecture des brouillons) et leur avancement.
- **Métadonnées** : on les complète à la main, ou avec « Remplir » : recherche de la série sur Manga-news et Wikipédia FR à la fois, une fiche choisie de chaque côté (ou d'un seul), puis un tableau compare, champ par champ, la valeur actuelle et celles des fiches : on garde l'une ou l'autre (« Tout prendre » par site). Un champ vide reçoit d'office la valeur du site préféré pour ce champ (Réglages, onglet Classement). Les noms de fichiers complètent ensuite le numéro, le titre (« Tome N ») et l'année de chaque tome (ou seuls, sans fiche). La série garde le lien de ses fiches : « Mettre à jour » les relit et les compare de nouveau, sans recherche. Scénario, dessin et éditeur proposent les noms déjà connus de la bibliothèque. « Publier » range chaque tome en `Série/Série #NN (Année).cbz` ; un brouillon remplace le tome publié du même numéro.
- **Manga-news** : la fiche donne auteurs, éditeur VF, format (d'après le type ou le pays d'origine), genres (rangés d'après la liste : « Suspense » devient « Thriller »), thèmes, résumé, statut de parution en VF et âge conseillé, gardé tel quel (« 12+ »). Les pages sont lues à la demande, une à la fois ; si le site affiche un contrôle anti-robot, Bento s'arrête et propose Wikipédia. L'image de la fiche peut servir de couverture de série.
- **Format, âge, genres et thèmes** : une série a un format, obligatoire (on ne peut ni enregistrer ni publier sans), pris dans la liste des réglages (Manga, Manhwa, Manhua, Webtoon, BD, Comics au départ) ; son mode de lecture sert aux séries qui n'en ont pas choisi. Elle a un âge, pris dans la grille des réglages (Tout public, 8+, 10+, 12+, 14+, 16+, 18+ au départ), des genres pris dans une liste gérée par l'admin, et des thèmes libres (« espion, famille »). Format et âge sont gardés dans Bento ; l'âge écrit aussi dans le ComicInfo la classification la plus proche, plus stricte (12+ → « Teen », 13 ans), pour les autres lecteurs ; genres et thèmes vont dans `Genre` et `Tags` du ComicInfo. Les genres des anciens fichiers sont rangés à la lecture, sans réécrire les fichiers : « Humour » devient « Comédie », un âge (« Mature ») est retiré, un mot inconnu devient un thème.
- **Champs modifiés** : un champ changé et pas encore enregistré passe en orange ; son bouton ↶ montre la valeur d'origine au survol et y revient d'un clic. Un webtoon se lit par défaut en défilement, un manhwa ou une BD de gauche à droite.
- **Statut et mode de lecture** : une série est « en cours de parution » ou « terminée » ; son mode de lecture (BD, manga, webtoon) remplace celui par défaut. Format, statut et mode de lecture se règlent dans l'éditeur, dès les brouillons (ils sont appliqués à la série à la publication) ; le statut se remplit aussi depuis Wikipédia.
- **Fiches à compléter** : l'éditeur affiche « Fiche à N % » (la liste de ce qui manque au clic) et la taille totale des tomes ; la fiche série montre le pourcentage à l'admin tant qu'il n'est pas à 100 %. « Séries à classer », dans le menu de l'avatar, liste les séries sans format ou sans âge (masquées aux comptes limités) : « Remplir » ouvre l'éditeur avec la recherche en ligne déjà lancée (ou ses fiches relues), puis « Enregistrer et suivante » passe à la série d'après.
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

- **Accueil** : « Reprendre la lecture » (pour chaque série entamée, le tome commencé ou, à défaut, le premier pas encore ouvert, avec l'avancement dans la série ; la plus récemment lue d'abord), puis toutes les séries. Les vignettes utilisent une version réduite des couvertures, créée à la première demande.
- **Menu ⋮ des cartes** (en bas à droite) :
  - sur une série : lire, reprendre ou relire ; marquer comme lue, lue jusqu'à un tome, ou non lue (après confirmation) ; ajouter à « À lire » ou l'en retirer ; modifier la série (admin) ;
  - sur un tome de « Reprendre la lecture » : le marquer comme lu, le retirer de « Reprendre » (progression effacée), voir la série.
  - Chaque action affiche un message avec « Annuler » pendant quelques secondes : la progression revient exactement comme avant, ordre de « Reprendre » compris.
- **Filtres** : état de lecture (toutes, à lire, non lues, en cours, lues) ; le bouton « Filtres » pour la collection, le format, le genre et le statut de parution, affichés ensuite en pastilles qu'on retire d'un clic ; et le tri par nom ou par ajouts récents. Tout reste dans l'adresse.
- **« À lire »** : le marque-page de la fiche série, propre à chacun ; « À lire » dans la barre « Séries » n'affiche que ces séries. (Les favoris ont été retirés.)
- **Collections** : des sélections partagées créées par l'admin (menu de l'avatar, « Collections »), visibles de tous selon leur contrôle parental. Une série s'y ajoute depuis le menu ⋯ de sa fiche. Listes et collections suivent une série renommée à la publication.

### Réglages (admin)

Depuis le menu de l'avatar, « Réglages », en deux onglets :
- **Général** : qualité JPEG et hauteur maximale des pages pour la compression, intervalle du scan automatique (la variable `SCAN_INTERVAL_MINUTES` n'en donne plus que la valeur par défaut), apparence par défaut. Enregistrés ensemble.
- **Classement**, enregistré à chaque changement : les formats (ajouter, renommer, choisir le mode de lecture, supprimer : ses séries devront en choisir un autre), la grille d'âges proposée pour les séries et les comptes, et la liste des genres (ajouter, renommer, changer les autres noms reconnus, supprimer ou fusionner dans un autre ; un genre renommé garde son ancien nom comme autre nom reconnu).

### Apparence

Par défaut, Bento suit le mode du système (clair ou sombre) en violet ; l'admin change ce thème par défaut dans les réglages. Chacun peut choisir le sien depuis le menu de l'avatar (« Apparence… ») : mode clair, sombre ou celui du système, et une couleur d'accent parmi douze. Ce choix est gardé sur l'appareil ; « Thème par défaut » y revient.

### Appli et plein écran

- **Android (Chrome)** : menu ⋮, « Installer l'application » (ou « Ajouter à l'écran d'accueil »). Bento s'ouvre alors depuis son icône, dans sa propre fenêtre, sans barre d'adresse.
- **iPad, iPhone (Safari)** : bouton Partager, « Sur l'écran d'accueil ».
- **Plein écran** : dans le lecteur, le bouton à côté des réglages masque la barre du navigateur et la barre d'état ; « Plein écran à l'ouverture », dans les réglages de lecture, l'active au premier toucher. Le plein écran continue d'un tome au suivant, et s'arrête en quittant le lecteur. Safari sur iPhone ne le permet pas : installer l'appli donne alors le plus grand écran possible.
- L'icône de l'appli vient de `apps/client/public/icon.svg`, fond plein (Android la découpe, iOS remplace la transparence par du noir) ; les PNG de `public/icons/` en sont tirés (192, 512 et 180 px pour iOS). L'onglet du navigateur et la barre du haut ont la boîte seule, sur fond transparent (`src/assets/logo.svg`, servi avec une empreinte dans son nom : jamais d'ancien logo en cache). Les barres du système prennent la couleur du fond de l'appli (clair ou sombre).

### Statistiques (admin)

Depuis le menu de l'avatar : chiffres de la bibliothèque, lecture par personne, activité récente, séries les plus lues, séries par tranche d'âge (et sans classification), statut des séries, et le bouton de scan de chaque bibliothèque.

### Contrôle parental

- **Âge maximal** : l'admin le règle pour chaque personne dans « Comptes et contrôle parental », depuis le menu de l'avatar, parmi les âges de la grille.
- **Âge d'une série** : celui choisi dans l'éditeur (grille des réglages), sinon la classification la plus restrictive de ses tomes (`AgeRating` du ComicInfo).
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
