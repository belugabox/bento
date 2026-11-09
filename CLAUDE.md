# Bento — notes pour Claude

Serveur de lecture et de gestion de mangas et BD, qui remplace Kavita pour la famille. Les fonctionnalités sont décrites dans [README.md](README.md), la spécification et la feuille de route dans [docs/SPEC.md](docs/SPEC.md). Ce fichier ne contient que ce que le code ne dit pas.

## Travailler avec l'utilisateur

- Il parle français et on le tutoie. Réponses en français, concises, sans jargon inutile. Le code, les commentaires et l'interface sont en français ; les messages de commit sont en anglais.
- Il donne souvent plusieurs demandes à la suite. Traite-les toutes, puis récapitule point par point.
- **Branche de travail : `feat/reading-foundation`** (poussée, pas encore de PR). Commit et push sur cette branche à la fin de chaque demande terminée et testée : c'est acquis. Ne pas fusionner dans `main`, ne pas ouvrir de PR sans qu'il le demande.
- Le déploiement est reporté (« on déploiera plus tard »).
- Il a refusé un nom de tri modifiable par série (« oublie »).
- Classement décidé le 6 novembre 2026 : format, âge, genres, thèmes. Formats, grille d'âges et genres sont gérés par l'admin (Réglages, onglet Classement). Le format est obligatoire, sans valeur par défaut ; format et âge exact restent dans Bento (le ComicInfo reçoit la classification la plus proche, plus stricte). Le « public » (shonen, seinen…) a été retiré : « je ne l'utiliserai pas » (migration 0015).
- Favoris retirés le 6 novembre 2026 (« À lire » seul : ces séries passent en tête de l'accueil). Collections retirées le même jour (« tu peux supprimer la partie collection ») : code supprimé, tables `collections` et `collection_series` gardées en base, inutilisées (les supprimer effacerait celles de la prod). Pocket ID retiré le 9 novembre 2026 : comptes gérés dans Bento (identifiant, mot de passe, avatar DiceBear « Clay », e-mail facultatif), créés par des liens d'invitation que l'admin envoie lui-même (partage, WhatsApp, texto, e-mail : pas de serveur de mail). Connexion par identifiant seul, pas par e-mail.

## Règles impératives

- **Secrets** : `apps/server/.env` (ignoré par Git) peut encore contenir l'ancien secret OIDC. Ne jamais l'afficher, le copier ou le committer.
- **Migrations Drizzle** : ne jamais modifier ni régénérer une migration qu'une base a pu appliquer ; en générer une nouvelle (`pnpm --filter server db:generate --name <nom>`). Avant de committer une migration, la vérifier sur une **copie** de `apps/server/data/bento.db*`, fichiers `-wal` et `-shm` compris : le serveur de dev de l'utilisateur tourne souvent et applique les migrations dès qu'elles apparaissent.
    - **Ne jamais compléter à la main une migration générée** : le serveur de dev peut l'appliquer avant (cas de 0016, appliquée sans sa liste de départ ni `on delete set null`, réparée par 0018). Mettre les données et corrections dans une migration à part, créée vide par `db:generate --custom --name <nom>` puis remplie.
    - drizzle-kit oublie `on delete` dans un `ALTER TABLE … ADD … REFERENCES` (SQLite).
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
- Les réglages d'un brouillon (statut, mode de lecture, couverture) sont dans la table `draft_statuses` (son nom d'origine est gardé) et sont appliqués à la publication. Quand une publication renomme une série, ses listes et son mode de lecture la suivent.
- **Cache des images** : la version d'un tome est la date de son fichier (`volumeVersion`, `cast(mtime_ms as integer)`). Avec `?v=` dans l'adresse, pages et couvertures sont servies `immutable` pour un an : toute réécriture du fichier doit changer sa date. Une couverture refaite sans toucher au fichier (nouvelle taille `COVER_SIZE`) garderait l'ancienne en cache : changer alors aussi le format de la version.
- **Âge d'une série** : `coalesce(series.age, series.min_age)` (choisi dans Bento, sinon déduit des tomes), pour la visibilité et les statistiques. La grille d'âges est dans les réglages (`ages`).
- **Formats** : table `formats` (0016, liste de départ par 0018), `series.format_id`. La clé étrangère n'a pas `on delete set null` sur la base de dev : `deleteFormat` détache les séries lui-même.
- **Classement** : `classification.ts` (partagé avec le client) range les genres bruts des fichiers (`series.genre` et `series.tags`, du premier tome) d'après la table `genres` (migration 0014, avec sa liste de départ), à chaque lecture : renommer un genre ne réécrit aucun fichier.
- **Comptes** (`auth/`) : `users.ts` (identifiant : `name` tel que tapé, `username` en minuscules pour la connexion), `passwords.ts` (scrypt), `links.ts` (table `invitations` : invitation sans `user_id`, sinon activation ou nouveau mot de passe ; jeton haché, 7 jours, une fois), `avatar.ts` (DiceBear 10, modules ES chargés par `require` : `@dicebear/styles` n'exporte que par `exports`), `avatarParts.ts` (partagé : avatar composé `c1_corps_tête_…`, rangé dans `avatar_seed` comme les anciennes graines ; mouvement « normal » et décalage de -8 % imposés à tous au rendu (`COMMON` dans `avatar.ts`) : tout changement du dessin demande d'augmenter `AVATAR_VERSION` côté client, les avatars étant gardés un an ; un test vérifie les variantes contre `clay.json`, à revoir à chaque mise à jour de `@dicebear/styles`), `rules.ts` (partagé avec le client). Les comptes venus de Pocket ID n'ont ni `username` ni `password_hash` (« À activer ») ; `oidc_subject` supprimé (0023). Ne jamais recréer la table `users` dans une migration : les migrations tournent dans une transaction, `foreign_keys` reste actif, et `DROP TABLE users` effacerait sessions, lectures et listes en cascade.
- **Vue lecteur** (`auth/routes.ts`, cookie `bento_preview`) : un âge (`10`, `all`), ou `user:N` pour simuler le lecteur N. En simulation, `c.var.user` est ce compte et toute requête autre que GET est refusée (sauf `/preview`) ; le client grise les boutons par `useReadOnly()` et le lecteur n'enregistre pas la progression. Jamais un admin ni soi-même.
- **Migration Kavita** (`migration/kavita.ts`, Réglages, onglet Kavita) : base envoyée dans `DATA_PATH/kavita` (à côté de `covers`), lue par better-sqlite3 (SQLite y intègre le `-wal` à la fermeture) ; fichiers reliés par chemin relatif (préfixe `FolderPath` de la bibliothèque Kavita, bibliothèques imbriquées comme `_draft` ignorées). Comptes créés « à activer ». Séances estimées par Kavita : début à minuit pile. Table `reading_sessions` (0025) : séances Kavita (`external_id` « kavita:N », sans doublon) et Bento (`POST /volumes/:id/reading-time`, hook `reader/readingTime.ts`).
- Le tri des séries ignore les articles (`library/sortName.ts`). Un nom de fichier « Boxer (The) » donne « The Boxer ».
- **Hors-séries et spéciaux** (décidé le 6 novembre 2026 : trois types, à part, fichiers « HS01 » et « SP01 ») : `library/volumeKind.ts` (partagé), type dans le `Format` du ComicInfo, colonne `volumes.kind` (0020), triée avant le numéro (`kindOrder`). Un ancien numéro préfixé (« HS01 ») est lu comme hors-série 1.

## Où on en est

Les étapes 1 à 3 de la feuille de route sont faites, ainsi qu'une page Réglages pour l'admin. **Bento est déployé** (`https://bento.belugabox.net`) : l'utilisateur fusionne `feat/reading-foundation` dans `main` par une PR, GitHub Actions publie l'image `:main`, il redémarre le conteneur. Ne jamais publier soi-même (ni push vers `main` ou `dev`, ni tag).

Prochaines étapes possibles, à faire valider par l'utilisateur :

1. **Tablettes et Android** (étape 4 de SPEC) : fait le 6 novembre 2026, à faire essayer par l'utilisateur sur ses appareils. Si Chrome ne propose pas « Installer l'application », ajouter un service worker (prévu à l'étape 9 de toute façon).
2. **Optimisations** : faites le 6 novembre 2026 (pages et couvertures gardées un an grâce à la version du tome dans l'adresse, pages d'admin chargées à la demande, tailles des pages lues dans le début des images). Un fichier `vendor` séparé a été essayé puis retiré : il alourdissait le premier chargement. Enregistrement du ComicInfo fait le 7 novembre 2026 : ajouté en fin d'archive avec un nouveau répertoire central (`appendEntry` dans `archive/zipIndex.ts`), sans recopier les pages (quelques ms au lieu de ~1,5 s par Go ; l'ancien ComicInfo reste dans le fichier, la compression le retire). AdmZip reste en secours (Zip64, archive abîmée). Une file d'enregistrement en arrière-plan avec verrou a été envisagée puis écartée, devenue inutile.
3. **Pages redimensionnées selon l'écran** (étape 5).
4. **Manga-news** (étape 6) : fait pour les séries le 6 novembre 2026 (`metadata/mangaNews.ts`, extraits de pages dans `test/fixtures/manga-news`). Les pages sont en UTF-8 ou en Windows-1252 selon la série, quel que soit l'en-tête ; le `TextDecoder('windows-1252')` de Node 22 lit en fait de l'ISO-8859-1, d'où la table maison. Le contrôle anti-robot de Cloudflare refuse parfois une requête de la prod puis laisse passer la suivante : une seule nouvelle tentative, identique, après 2 s (jamais de résolution ni de déguisement), et pages gardées 10 min (7 novembre 2026). Reste : les pages de tome (liens `/manga/<Série>/vol-N`), pas encore examinées.
5. **Fiches à compléter** (étape 7) : faite le 6 novembre 2026 (`components/completeness.ts`, page « Séries à classer », `?fill=online` sur l'éditeur pour lancer la recherche en ligne, `&from=to-classify` pour « Suivante »). Remplissage revu le même jour : recherche sur les deux sites à la fois, tableau de comparaison (`SheetComparison.tsx`, logique dans `editing.ts`), site préféré par champ (réglage `sourcePriority`), fiches gardées dans `series.source` (colonne nommée `sources` dans le code, migration 0019 : « manga-news:Id wikipedia:123 », voir `metadata/sourceLink.ts`), suggestions de noms (`/libraries/:id/credits`).
6. **Accueil revu** le 7 novembre 2026 : recherche dans l'en-tête (aussi par auteur, `?q=` sur l'accueil), une seule grille sans titre (tomes à reprendre, filtrés comme leur série, puis les autres séries ; 9 novembre), barre de filtres collée en bas de l'écran, menu « Lecture » retiré le 9 novembre (« à lire » en tête, séries lues à la fin et grisées ; icônes d'état dans le lien de la carte, prop `badge` de `CoverCard`), affichage dans « Thème et affichage… » (`components/libraryDisplay.ts`, localStorage `bento:display` : grille ou liste, taille en cran de glissière 0 à 4 (`CARD_SIZES`), couvertures seules), statut de parution dans le menu de tri, pastilles de genres (filtre de format retiré le 9 novembre ; les 5 aux plus de séries, puis « Plus » avec le nombre de séries, revu le 9 novembre).
7. **Suggestions** (étape 8) : « Dans le même genre » sur la fiche série et « Lu par la famille » sur l'accueil d'abord, puis « Pour toi ».
8. **Hors ligne** (étape 9), **tomes manquants** (10), **bascule** (11).
