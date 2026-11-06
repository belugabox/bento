# Bento — notes pour Claude

Serveur de lecture et de gestion de mangas et BD, qui remplace Kavita pour la famille. Les fonctionnalités sont décrites dans [README.md](README.md), la spécification et la feuille de route dans [docs/SPEC.md](docs/SPEC.md). Ce fichier ne contient que ce que le code ne dit pas.

## Travailler avec l'utilisateur

- Il parle français et on le tutoie. Réponses en français, concises, sans jargon inutile. Le code, les commentaires et l'interface sont en français ; les messages de commit sont en anglais.
- Il donne souvent plusieurs demandes à la suite. Traite-les toutes, puis récapitule point par point.
- **Branche de travail : `feat/reading-foundation`** (poussée, pas encore de PR). Commit et push sur cette branche à la fin de chaque demande terminée et testée : c'est acquis. Ne pas fusionner dans `main`, ne pas ouvrir de PR sans qu'il le demande.
- Le déploiement est reporté (« on déploiera plus tard »).
- Il a refusé un nom de tri modifiable par série (« oublie »).
- Classement décidé le 6 novembre 2026 : format, genres, thèmes. La liste des genres est gérée par l'admin (Réglages) ; le format reste dans Bento (pas dans le ComicInfo). Le « public » (shonen, seinen…) a été retiré : « je ne l'utiliserai pas » (migration 0015).
- Favoris retirés le 6 novembre 2026 (« À lire » seul, en filtre de la barre « Séries »). Les collections restent telles quelles, mises de côté. Changer de fournisseur de connexion (TinyAuth, Authelia) : « oublie pour le moment ».

## Règles impératives

- **Secret OIDC** : il est dans `apps/server/.env` (ignoré par Git). Ne jamais l'afficher, le copier ou le committer.
- **Migrations Drizzle** : ne jamais modifier ni régénérer une migration qu'une base a pu appliquer ; en générer une nouvelle (`pnpm --filter server db:generate --name <nom>`). Avant de committer une migration, la vérifier sur une **copie** de `apps/server/data/bento.db*`, fichiers `-wal` et `-shm` compris : le serveur de dev de l'utilisateur tourne souvent et applique les migrations dès qu'elles apparaissent.
    - drizzle-kit ne sait pas répondre à ses questions interactives : un renommage se fait en deux migrations.
    - Quand drizzle-kit recrée une table pour changer une colonne, il copie aussi les colonnes nouvelles depuis l'ancienne table : corriger l'`INSERT … SELECT` avant tout lancement (cas de 0011).
- **Fichiers de l'utilisateur** : ne pas toucher à sa bibliothèque de dev (`O:/PERSO/beluga-box/apps/server/RED/Books/Manga`, voir `LIBRARIES` dans `.env`). Faire les essais sur des copies, dans le dossier temporaire de la session.
- **Processus** : ne jamais tuer de processus en masse. Arrêter seulement un PID identifié et vérifié.
- **Sites web** : ne jamais contourner une protection anti-robot (Cloudflare…).

## Environnement (Windows)

- Shell : Git Bash. Les longs heredocs échouent, et les accents passent mal dans `python -c` ou les heredocs. Pour une modification de plusieurs lignes, écrire un script Python dans le dossier temporaire avec l'outil Write, puis le lancer avec `python -I`.
- prettier reformate à l'enregistrement. Relire le fichier avant une modification exacte après un `prettier --write`.
- Vérifications avant chaque commit :
    - serveur : `cd apps/server && pnpm test` (tsc des tests, puis vitest) ;
    - client : `cd apps/client && npx tsc -b && npx eslint . && npx vitest run` ;
    - le tout : `pnpm build` à la racine.
- Pour essayer du code serveur sur des données réelles : un petit script `.ts` lancé avec `npx tsx` depuis `apps/server`, à supprimer ensuite.
- better-sqlite3 reste en 12.x (la 13 n'a pas de binaires pour Node 22).

## Repères techniques

- Monorepo pnpm :
    - `apps/server` : Hono, zod, Drizzle et SQLite, AdmZip, sharp ;
    - `apps/client` : React 19, Mantine 7, react-router 7, client typé `hc` de Hono.
- Modules sans Node partagés avec le client par `@server/types` (`apps/server/src/types.ts`).
- **Sous-requêtes Drizzle** : les écrire en SQL brut avec des colonnes préfixées (`series.id`) ; Drizzle ne préfixe pas les colonnes des sous-requêtes corrélées.
- **Tests serveur** : `test/helpers.ts` (`setup`, `writeCbz`, `sessionCookie`). `createApi` accepte `settings` et `compression` en option.
- **Tests client** : jsdom. Attendre les changements d'adresse avec `vi.waitFor`, les fenêtres Mantine avec `findBy…`.
- Le lecteur est découpé en trois : `reader/Reader.tsx` (composant), `ReaderPage.tsx` (route `/read/:id`), `ReaderPreview.tsx` (aperçu par-dessus l'éditeur). `ReaderPage` ignore le tome précédent pendant le chargement du suivant ; c'était un bug.
- La compression passe par une file en arrière-plan (`library/compression.ts`) : un gros tome dépasse le délai d'une requête derrière Cloudflare (100 s).
- Les réglages de l'admin sont dans `settings.ts` (table `settings`, migration 0013) : compression (qualité 90, 2400 px par défaut) et intervalle du scan.
- Les réglages d'un brouillon (statut, mode de lecture, couverture) sont dans la table `draft_statuses` (son nom d'origine est gardé) et sont appliqués à la publication. Quand une publication renomme une série, ses listes, ses collections et son mode de lecture la suivent.
- **Cache des images** : la version d'un tome est la date de son fichier (`volumeVersion`, `cast(mtime_ms as integer)`). Avec `?v=` dans l'adresse, pages et couvertures sont servies `immutable` pour un an : toute réécriture du fichier doit changer sa date. Une couverture refaite sans toucher au fichier (nouvelle taille `COVER_SIZE`) garderait l'ancienne en cache : changer alors aussi le format de la version.
- **Classement** : `classification.ts` (partagé avec le client) range les genres bruts des fichiers (`series.genre` et `series.tags`, du premier tome) d'après la table `genres` (migration 0014, avec sa liste de départ), à chaque lecture : renommer un genre ne réécrit aucun fichier.
- Le tri des séries ignore les articles (`library/sortName.ts`). Un nom de fichier « Boxer (The) » donne « The Boxer ».

## Où on en est

Les étapes 1 à 3 de la feuille de route sont faites, ainsi qu'une page Réglages pour l'admin. **Bento est déployé** (`https://bento.belugabox.net`) : l'utilisateur fusionne `feat/reading-foundation` dans `main` par une PR, GitHub Actions publie l'image `:main`, il redémarre le conteneur. Ne jamais publier soi-même (ni push vers `main` ou `dev`, ni tag).

Prochaines étapes possibles, à faire valider par l'utilisateur :

1. **Tablettes et Android** (étape 4 de SPEC) : fait le 6 novembre 2026, à faire essayer par l'utilisateur sur ses appareils. Si Chrome ne propose pas « Installer l'application », ajouter un service worker (prévu à l'étape 7 de toute façon).
2. **Optimisations** : faites le 6 novembre 2026 (pages et couvertures gardées un an grâce à la version du tome dans l'adresse, pages d'admin chargées à la demande, tailles des pages lues dans le début des images). Un fichier `vendor` séparé a été essayé puis retiré : il alourdissait le premier chargement. Reste l'enregistrement du ComicInfo en recopiant l'archive par morceaux au lieu d'AdmZip (« on verra après »).
3. **Pages redimensionnées selon l'écran** (étape 5).
4. **Manga-news** (étape 6) : fait pour les séries le 6 novembre 2026 (`metadata/mangaNews.ts`, extraits de pages dans `test/fixtures/manga-news`). Les pages sont en UTF-8 ou en Windows-1252 selon la série, quel que soit l'en-tête ; le `TextDecoder('windows-1252')` de Node 22 lit en fait de l'ISO-8859-1, d'où la table maison. Reste : les pages de tome (liens `/manga/<Série>/vol-N`), pas encore examinées.
5. **Hors ligne** (étape 7), **tomes manquants** (8), **bascule** (9).
