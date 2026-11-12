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
| `PUBLIC_URL` | — (requis) | Adresse publique de Bento : liens d'invitation, cookies `Secure` en HTTPS |

### Gestion des tomes (admin)

- **Brouillons** : les tomes déposés dans le dossier `_draft` d'une bibliothèque (par la synchro de beluga-box, par exemple) apparaissent dans « Brouillons » : l'icône en haut à droite indique le nombre de séries en attente. Chaque dossier forme une série ; un tome déposé seul à la racine de `_draft` forme la sienne. Les `.cbr` et les RAR déguisés en `.cbz` sont convertis au passage.
- **Série existante** : « Ajouter à une série existante » rattache les tomes d'un brouillon à une série publiée : son nom et ses champs de série sont repris, et les tomes rejoignent son dossier à la publication, même si celui-ci porte un autre nom.
- **Tâches** : l'icône en haut à droite montre les tâches de fond en cours (scan, compression, publication, lecture des brouillons) et leur avancement.
- **Métadonnées** : on les complète à la main, ou avec « Remplir » : recherche de la série sur Manga-news, Wikipédia FR et Bedetheque à la fois (Bedetheque : BD, comics et romans graphiques, éditeur français, one shots ; chaque site peut être désactivé dans Réglages, « Fiches en ligne ») (sur Wikipédia, mangas et bandes dessinées ensemble, quelle que soit la bibliothèque : un roman graphique comme « Asterios Polyp » est trouvé ; un nom rangé « Sculpteur (le) » est cherché « Le Sculpteur »), une fiche choisie de chaque côté (ou d'un seul), puis un tableau compare, champ par champ, la valeur actuelle et celles des fiches, une carte par champ (lisible sur téléphone) : chaque valeur différente n'y est qu'une fois, avec ceux qui la donnent (« Casterman — Actuel · Bedetheque » ; majuscules, accents et ponctuation ne comptent pas, un champ où rien ne change n'apparaît pas), et on garde l'une ou l'autre ; un long résumé se déplie (« Voir tout »). Un champ vide reçoit d'office la valeur du site préféré pour ce champ (Réglages, onglet Classement). Les noms de fichiers complètent ensuite le numéro et l'année de chaque tome (le titre, facultatif, n'est plus rempli) (ou seuls, sans fiche). La série garde le lien de ses fiches (sur la fiche série, en petit sous le résumé : « Sources : Manga-news · Wikipédia », pour tous les comptes) : « Mettre à jour » les relit et les compare de nouveau, sans recherche. Scénario, dessin et éditeur proposent les noms déjà connus de la bibliothèque ; ceux des fiches en reprennent l'écriture (sans casse ni accents, prénom et nom dans n'importe quel ordre), sinon les noms de famille en capitales (« Hiroya OKU ») sont remis en casse normale. « Publier » range chaque tome en `Série/Série #NN (Année).cbz` ; un brouillon remplace le tome publié du même numéro.
- **Note des lecteurs** : gardée dans Bento (jamais dans les fichiers) chaque fois qu'une fiche Manga-news (note des membres, sur 20) ou Bedetheque (moyenne des notes des albums, pondérée par leurs votes) est lue par « Remplir » ou « Mettre à jour », ramenée sur 5 avec son nombre d'avis. Elle suit les séries liées à ces fiches. La note d'une série est la moyenne de tous les avis (chaque site selon son nombre d'avis) : pastille « ★ 4,4 » sur la fiche série, avec la note de chaque site au clic ; dans l'aperçu des fiches de « Remplir » ; dans les détails des cartes en liste ; à la place du nombre de tomes quand l'accueil est trié « Mieux notées » ; tri « Note » dans la page « Séries ». Elle compte dans la complétude d'une fiche (« Note » manque tant qu'aucune fiche n'en a donné). L'éditeur montre la même pastille que la fiche série (« ★ 4,3 », détail par site au clic) ou « Pas de note », brouillons compris (la note suit leurs fiches). Trié « Mieux notées », l'accueil range par note avant la liste « à lire » (les séries lues restent à la fin), le bloc « En cours » aussi, avec la note sur ses cartes.
- **Titre et année de chaque tome** : après la comparaison (case cochée par défaut, quand une fiche Bedetheque ou Wikipédia est choisie), chaque tome reçoit son titre et son année d'après la fiche, rapprochés par type et numéro ; seuls les champs vides sont remplis. Bedetheque donne titre et année (dépôt légal) de chaque album ; sa page de série en montre 10, la page « Tout » n'est demandée que s'il y en a plus. Wikipédia donne l'année de sortie en France (modèles « TomeBD » de l'article ou de sa « Liste des chapitres de… », parties comprises). Manga-news ne donne pas ces informations sans une page par tome (trop de requêtes).
- **Tomes manquants** : les numéros de 1 au dernier tome paru absents de Bento, d'après la numérotation (trous) et le nombre de tomes parus des fiches liées (Manga-news, Bedetheque ; gardé à chaque lecture d'une fiche, relecture de nuit comprise). Quand elles ne disent pas le même nombre (une autre édition : Gantz en Perfect sur Bedetheque, l'édition normale sur Manga-news), la plus proche des tomes de Bento est retenue, et l'autre nombre est indiqué. Manga-news compte dans la série ses hors-séries et spéciaux (Death Note : « How to Read », 13e tome) : ceux de Bento en sont retirés ; Bedetheque les compte à part. Visibles de l'admin seulement, dans la page Séries : une ligne sur la carte (« Tomes manquants : 7, 13 à 15 (15 parus d'après Manga-news ; Bedetheque : 14) ») et un filtre « Tomes manquants ». Rien pour un one-shot, ni pour une série qui a des intégrales. 
- **Fiches proposées** (avec la mise à jour des fiches, la nuit) : pour une série sans fiche Manga-news (mangas seulement) ou Bedetheque, Bento cherche son nom sur le site, puis l'autre écriture (« & » pour « et », et l'inverse) s'il n'y a rien ; les fiches au même nom (sans majuscules, accents, ponctuation, article, « et » ni « & », « × » lu « x » : « Spy × Family » = « Spy X Family ») sont lues puis proposées dans Séries, avec ce qu'elles disent (auteurs, éditeur, tomes, année, « même auteur ») : « Lier » l'ajoute à la série (sa note, déjà relevée, suit), « Ce n'est pas elle » la refuse pour de bon. Rien n'est lié d'office. Une requête par passage, au même rythme que la relecture ; une série sans résultat est cherchée de nouveau après 90 jours, ou si son nom change.
- **Mise à jour des fiches** (Réglages, onglet Classement ; désactivée par défaut) : les fiches Manga-news et Bedetheque liées aux séries sont relues une fois par mois, la nuit (entre 2 h et 6 h, heure du serveur), une toutes les 10 minutes au plus en alternant les sites (rythme réglable : 5, 10, 15, 20, 30 ou 60 minutes), sans jamais de nouvel essai : au premier refus (anti-robot, trop de requêtes) ou site en panne, tout s'arrête 24 h. La note est mise à jour ; les autres changements (titre, statut, nombre de tomes, auteurs, éditeur, résumé, fiche disparue) ne sont pas appliqués mais signalés dans « Séries » (filtre « Fiches à revoir », « Tomes : 12 → 13 » sur la carte, bouton « Revoir » qui relit les fiches dans l'éditeur et les compare). Une fiche lue dans l'éditeur sert de nouvelle référence. « Lancer maintenant » fait un passage même le jour, au même rythme.
- **Hors-séries et spéciaux** : la colonne « Type » de l'éditeur (Tome, Hors-série, Spécial) est gardée dans le champ `Format` du ComicInfo ; chaque type a sa numérotation. Les noms de fichiers « HS01 », « Hors-série 1 », « SP01 », « Spécial 2 » sont reconnus, et la publication range en `Série HSNN (Année).cbz` et `Série SPNN (Année).cbz`. Ils sont à part : après les tomes sur la fiche série (sections « Hors-séries » et « Spéciaux ») et dans l'ordre de lecture.
- **One-shots et intégrales** : deux autres types de tome dans la colonne « Type » (champ `Format` : « One-shot », « Intégrale »). Ils comptent comme des tomes de la série (pas à part comme les hors-séries). Un one-shot n'a pas de numéro (le choisir vide le numéro et le désactive dans l'éditeur) : « One-shot » sur la carte et la fiche, bouton « Lire », pas de carte de tome sur la fiche, fichier `Série/Série (Année).cbz`. Une intégrale sans numéro est traitée de la même façon (« Intégrale »). Une intégrale est numérotée « Intégrale 2 » (« INT2 » en court), fichier `Série INT02`, et les noms « INT01 » ou « Intégrale 1 » sont reconnus (pas « Intégrale 10 tomes »).
- **Manga-news** : la fiche donne auteurs, éditeur VF, format (d'après le type ou le pays d'origine), genres (rangés d'après la liste : « Suspense » devient « Thriller »), thèmes, résumé, statut de parution en VF et âge conseillé, gardé tel quel (« 12+ »). Les pages sont lues à la demande, une à la fois, et gardées 10 minutes ; si le site affiche un contrôle anti-robot ou limite les requêtes, Bento refait une seule fois la même requête après 2 secondes (ces refus sont souvent ponctuels), puis s'arrête et propose Wikipédia. L'image de la fiche peut servir de couverture de série.
- **Format, âge, genres et thèmes** : une série a un format, obligatoire (on ne peut ni enregistrer ni publier sans), pris dans la liste des réglages (Manga, Manhwa, Manhua, Webtoon, BD, Comics au départ) ; son mode de lecture sert aux séries qui n'en ont pas choisi. Elle a un âge, pris dans la grille des réglages (Tout public, 8+, 10+, 12+, 14+, 16+, 18+ au départ), des genres pris dans une liste gérée par l'admin, et des thèmes libres (« espion, famille »). Format et âge sont gardés dans Bento ; l'âge écrit aussi dans le ComicInfo la classification la plus proche, plus stricte (12+ → « Teen », 13 ans), pour les autres lecteurs ; genres et thèmes vont dans `Genre` et `Tags` du ComicInfo. Les genres des anciens fichiers sont rangés à la lecture, sans réécrire les fichiers : « Humour » devient « Comédie », un âge (« Mature ») est retiré, un mot inconnu devient un thème.
- **Champs modifiés** : un champ changé et pas encore enregistré passe en orange ; son bouton ↶ montre la valeur d'origine au survol et y revient d'un clic. Un webtoon se lit par défaut en défilement, un manhwa ou une BD de gauche à droite.
- **Statut et mode de lecture** : une série est « en cours de parution » ou « terminée » ; son mode de lecture (BD, manga, webtoon) remplace celui par défaut. Format, statut et mode de lecture se règlent dans l'éditeur, dès les brouillons (ils sont appliqués à la série à la publication) ; le statut se remplit aussi depuis Wikipédia.
- **Fiches à compléter** : l'éditeur affiche « Fiche à N % » (la liste de ce qui manque au clic) et la taille totale des tomes ; la fiche série montre le pourcentage à l'admin tant qu'il n'est pas à 100 %. « Séries », dans le menu de l'avatar (avec le nombre de séries à classer), montre toutes les séries en cartes (une colonne sur téléphone, deux ou trois sur ordinateur), les fiches les moins complètes d'abord : format, âge, statut, note ; tomes, taille, moyenne par tome et par page, genres, date d'ajout ; une bulle « 83 % · Note, Année de 131 tomes » (ce qui manque y est écrit ; le détail au clic). Format, âge et statut se changent dans l'éditeur. Barre d'outils collée en haut : recherche, « Trier par » (fiche par défaut, nom, format, âge, statut, tomes, taille, taille par page, dernier ajout, note) et sens du tri, bouton « Filtres » (fiches : toutes par défaut, à classer (sans format ou sans âge, masquées aux comptes limités), sans résumé, sans genre, à moins de 80 %, à revoir, proposées ; format ; statut ; fiches en ligne : aucune, sans Manga-news (mangas seulement), sans Bedetheque, sans Wikipédia, chacune avec son nombre de séries). Chaque carte dit ses fiches liées (« Fiches : Manga-news · Bedetheque », ou « Aucune fiche en ligne »). Un brouillon publié dans une série existante ajoute ses fiches à celles de la série (celle du brouillon l'emporte pour son site). « Remplir » ouvre l'éditeur avec la recherche en ligne déjà lancée (ou ses fiches relues), puis « Enregistrer et suivante » passe à la série à classer d'après.
- **Séries publiées** : « Modifier les métadonnées » sur la fiche série. Si la série est renommée, « Renommer les fichiers » déplace les tomes, sans perdre la progression de lecture.
- **Compression** : « Compresser… » estime le gain de tous les fichiers en une fois (8 pages de 3 tomes, recompressées 4 à la fois ; le rapport obtenu vaut pour tous), puis recompresse les pages en arrière-plan sur le serveur : par défaut 2400 px de haut au plus, JPEG qualité 90 (modifiable dans les réglages). Un fichier n'est réécrit que s'il y gagne ; le ComicInfo est gardé. Sur un vrai tome de 258 Mo : −43 % en une trentaine de secondes (−52 % en qualité 85). Un fichier compressé garde ses réglages dans le commentaire de l'archive : avec des réglages au moins aussi forts, il n'est ni réestimé ni recompressé (sans gain, et la qualité baisserait).
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

En fin de tome, pas d'écran de fin : page par page, la page suivante ouvre le tome suivant (s'il est lisible : en ligne, ou téléchargé ; sinon un message « Dernier tome de la série » ou « Tome suivant pas téléchargé ») ; en webtoon, un bouton « Tome suivant » sous la dernière page. Le retour reste dans la barre du haut.

### Accueil et listes

- **Accueil** : une grille en blocs (par défaut trois, voir « Grouper par »), chacun sous un titre discret en petites capitales grises avec son nombre de cartes. D'abord « En cours », les tomes à reprendre : pour chaque série entamée, toutes, le tome commencé ou, à défaut, le premier pas encore ouvert, avec l'avancement dans la série ; la plus récemment lue d'abord ; la carte ouvre le lecteur (▶ en couleur). Puis « À découvrir », les séries pas lues : celles de ta liste « À lire » (marque-page gris) d'abord. Enfin « Déjà lues », marquées d'une coche grise. Un clic sur une icône ouvre la carte. Une pastille « +2 » en haut à gauche d'une carte (l'icône d'état reste à droite) compte les tomes ajoutés depuis ta dernière lecture de la série (séries entamées seulement). En revenant à l'accueil, il s'affiche tout de suite, à la même position, puis se met à jour. « Thème et affichage… » (menu du compte, sous « Mon compte ») règle l'affichage sur l'appareil : grille ou liste (avec, pour chaque série, auteur et dessinateur, format, année, âge, parution et genres), taille des cartes (glissière à cinq crans, des très petites aux très grandes, aussi pour les tomes d'une série), couvertures seules. Les filtres et la recherche s'appliquent à tout. Les vignettes utilisent une version réduite des couvertures, créée à la première demande.
- **Menu ⋮ des cartes** (en bas à droite) :
  - sur une série : lire, reprendre ou relire ; marquer comme lue, lue jusqu'à un tome, ou non lue (après confirmation) ; ajouter à « À lire » ou l'en retirer ; modifier la série (admin) ;
  - sur un tome à reprendre : le marquer comme lu, marquer la série lue jusqu'à ce tome ou en entier, le retirer de « Reprendre » (progression effacée), voir la série, la modifier (admin).
  - sur un tome de la fiche série : lire, continuer ou relire, lire depuis le début ; marquer comme lu ou non lu, lu jusqu'à ce tome (tomes seulement), effacer la progression ; utiliser comme couverture de la série et modifier la série (admin).
  - Chaque action affiche un message avec « Annuler » pendant quelques secondes : la progression revient exactement comme avant, ordre de « Reprendre » compris.
- **Recherche** : dans l'en-tête, depuis n'importe quelle page ; elle trouve les séries par nom, genre, thème ou auteur (scénario, dessin), sans casse ni accents, et s'affiche sur l'accueil.
- **Filtres** : sur une seule ligne, collée en bas de l'écran. Elle commence par le choix Grille / Liste (le même que dans « Thème et affichage… »). Le menu de tri (nom, ajouts récents) qui contient aussi « Séries lues : afficher / masquer » (gardé sur l'appareil) et le statut de parution, puis les genres en pastilles (les 3 qui ont le plus de séries, les autres dans « Plus » avec leur nombre de séries). Un clic choisit une pastille, un second la retire. Sur un écran étroit, un seul bouton « Genre » ouvre la liste de tous les genres. Tout reste dans l'adresse.
- **Grouper par** (bouton de la barre de l'accueil, choix gardé sur l'appareil) : par lecture (par défaut : « En cours », « À découvrir », « Déjà lues »), format, âge, lettre (articles et accents ignorés, « # » pour les chiffres), date d'ajout (ce mois-ci, cette année, puis par année), lecteur (« Lu par Léa » pour chaque personne de la famille qui a lu assez de la série, même seuil que la fiche ; une série peut être dans plusieurs blocs) ou aucun (une grille sans titres). Sauf avec « Lecture », pas de bloc « En cours » : une série en cours est dans son bloc, avec sa carte de reprise (jamais à deux endroits). Titres des blocs en couleur principale claire (celle du « Plus » de la barre), leur nombre en gris. Il remplace l'ancien filtre « Lu par ».
- **« Lu par »** : sur la fiche série, les avatars des autres comptes qui en ont lu assez (part des pages de la série, 10 % par défaut, réglable dans Réglages, onglet Général), les plus avancés d'abord, à droite des boutons de lecture ; au clic, le nom de chacun, son dernier tome ouvert (« Tome 5, page 34 sur 200 », « Tome 5 lu ») et sa part de la série.
- **« À lire »** : le marque-page de la fiche série, propre à chacun ; ces séries remontent en tête de l'accueil, après les tomes à reprendre. (Les favoris ont été retirés.)
- La liste « à lire » suit une série renommée à la publication. (Les collections partagées ont été retirées.)

### Réglages (admin)

Depuis le menu de l'avatar, « Réglages », en deux onglets :
- **Général** : qualité JPEG et hauteur maximale des pages pour la compression, intervalle du scan automatique (la variable `SCAN_INTERVAL_MINUTES` n'en donne plus que la valeur par défaut), apparence par défaut. Enregistrés ensemble.
- **Classement**, enregistré à chaque changement : les formats (ajouter, renommer, choisir le mode de lecture, supprimer : ses séries devront en choisir un autre), la grille d'âges proposée pour les séries et les comptes, et la liste des genres (ajouter, renommer, changer les autres noms reconnus, supprimer ou fusionner dans un autre ; un genre renommé garde son ancien nom comme autre nom reconnu).

### Migration depuis Kavita

Réglages, onglet « Migration Kavita » (admin) : envoyer `kavita.db` (avec `kavita.db-wal` et `kavita.db-shm`, copiés depuis le dossier de configuration de Kavita, Kavita arrêté), voir ce qui serait repris, puis « Migrer ». Relançable : rien n'est repris deux fois.

- **Tomes** retrouvés par leur chemin dans la bibliothèque (Kavita et Bento lisent les mêmes fichiers) ; la liste des introuvables (renommés depuis le dernier scan de Kavita) est affichée.
- **Comptes** : chacun associé au compte Bento du même nom (sans casse ni accents), sinon créé « à activer » avec la limite d'âge de Kavita (modifiable), ou ignoré.
- **Progression** : tomes finis et page atteinte ; une lecture plus récente dans Bento est gardée. « Want to read » devient « À lire ».
- **Tomes sautés** (case à cocher) : les tomes jamais ouverts ou pas finis dans Kavita mais placés avant le dernier tome fini d'une série (premiers tomes lus ailleurs) sont marqués lus.
- **Dates d'ajout** (case à cocher) : la plus ancienne entre Kavita et Bento.
- **Temps de lecture** (case à cocher) : les séances de Kavita ; celles qu'il a estimées (minuit pile, environ une heure) seulement si on coche « Avec les séances estimées ».

Bento mesure aussi le temps passé dans son lecteur (temps entre deux pages, sans les pauses de plus de 2 minutes) : colonne « Temps » et tuile « Temps de lecture » des statistiques.

### Thème et affichage

Par défaut, Bento suit le mode du système (clair ou sombre) en violet ; l'admin change ce thème par défaut dans les réglages. Chacun peut choisir le sien depuis le menu de l'avatar (« Thème et affichage… ») : mode clair, sombre ou celui du système, et une couleur d'accent parmi douze. Ce choix est gardé sur l'appareil ; « Thème par défaut » y revient.

### Appli et plein écran

- **Sans réseau** : un service worker (`apps/client/sw/sw.js`, écrit au build avec la liste de tous les fichiers de l'appli) garde l'application sur l'appareil : Bento s'ouvre sans réseau, avec la dernière personne connectée sur l'appareil, et un bandeau « Hors ligne ». Les pages demandées passent par le réseau d'abord (4 s au plus). En développement (`pnpm dev`), pas de service worker.
- **Téléchargements** : « Télécharger » dans le menu ⋮ d'un tome de la fiche série, et le bouton « Télécharger » (à côté du marque-page) sur la fiche série, qui ouvre son petit menu : « Le prochain tome », « Les 2, 3 ou 5 prochains tomes » (le tome à lire compris, mêmes choix que dans « Téléchargements »), ou « Tous les tomes pas lus ». Les pages (à la largeur de l'écran), la couverture et la fiche du tome vont dans le stockage du navigateur (Bento demande à le garder). « Téléchargements », dans le menu du compte, en trois parties : « Sur cet appareil » (une ligne par tome : téléchargement en cours avec sa barre, ou lecture et taille ; une corbeille sur chaque ligne, qui arrête aussi un téléchargement en cours ; « Supprimer les tomes lus », « Tout supprimer », place prise et libre), « Propositions » (les prochains tomes des 5 séries lues le plus récemment, pas encore sur l'appareil : « Télécharger » ou « Tout télécharger »), et « Automatique », à part, qui télécharge ces propositions tout seul. Une icône marque les tomes téléchargés sur la fiche série, un petit anneau ceux en cours de téléchargement ; pendant un téléchargement, un anneau d'avancement s'affiche aussi dans l'en-tête (il mène à « Téléchargements »). Ils sont effacés à la déconnexion, et quand un autre compte se connecte sur l'appareil ; pas de téléchargement en vue simulée.
- **Lecture hors ligne** : le lecteur prend les pages téléchargées d'abord (même avec du réseau) ; sans réseau, il lit la fiche du tome téléchargé, et la lecture faite sur l'appareil y est gardée. L'accueil hors ligne montre les tomes de l'appareil (« Sur cet appareil »). À la fin d'un tome, « Tome suivant pas téléchargé » si besoin. Sans réseau, le retour du lecteur mène aux tomes de l'appareil (« Retour aux téléchargements ») au lieu de la fiche série, et une fiche série ouverte sans réseau le dit, avec un lien vers ces tomes.
- **Téléchargements automatiques** (page « Téléchargements », réglage de l'appareil, désactivé par défaut) : télécharger tout seul les propositions, 1, 2, 3 ou 5 tomes par série (le tome en cours compris, réglage partagé avec les propositions), en Wi-Fi seulement si on veut (connu sur Android) ; « Effacer les tomes lus depuis 30 jours » (activé par défaut). Passage à l'ouverture de Bento puis toutes les 30 minutes, avec du réseau, et tout de suite après un changement du réglage.
- **Lecture sans réseau, envoyée plus tard** : pages atteintes et temps de lecture sont gardés sur l'appareil (`bento:pending`, la dernière page de chaque tome seulement), puis envoyés au retour du réseau ou à la prochaine ouverture, avec leur heure réelle : le serveur garde la lecture la plus récente (une lecture faite ailleurs entre-temps n'est pas écrasée), et « Reprendre » suit l'heure réelle. Effacés à la déconnexion.
- **Pages à la taille de l'écran** : le lecteur demande chaque page réduite à la largeur de l'écran (800, 1200 ou 1600 pixels réels, d'après son petit côté ; au-delà, la page d'origine), en WebP : environ trois fois plus légère. Le serveur calcule chaque page réduite une fois et la garde dans `DATA_PATH/pages` (2 Go au plus, les plus anciennes effacées) ; une nouvelle version du tome efface les anciennes.
- **Android (Chrome)** : menu ⋮, « Installer l'application » (ou « Ajouter à l'écran d'accueil »). Bento s'ouvre alors depuis son icône, dans sa propre fenêtre, sans barre d'adresse.
- **iPad, iPhone (Safari)** : bouton Partager, « Sur l'écran d'accueil ».
- **Plein écran** : dans le lecteur, le bouton à côté des réglages masque la barre du navigateur et la barre d'état ; « Plein écran à l'ouverture », dans les réglages de lecture, l'active au premier toucher. Le plein écran continue d'un tome au suivant, et s'arrête en quittant le lecteur. Safari sur iPhone ne le permet pas : installer l'appli donne alors le plus grand écran possible.
- L'icône de l'appli vient de `apps/client/public/icon.svg`, fond plein (Android la découpe, iOS remplace la transparence par du noir) ; les PNG de `public/icons/` en sont tirés (192, 512 et 180 px pour iOS). L'onglet du navigateur et la barre du haut ont la boîte seule, sur fond transparent (`src/assets/logo.svg`, servi avec une empreinte dans son nom : jamais d'ancien logo en cache). Les barres du système prennent la couleur du fond de l'appli (clair ou sombre).

### Statistiques (admin)

Depuis le menu de l'avatar : chiffres de la bibliothèque, lecture par personne, activité récente, séries les plus lues, séries par tranche d'âge (et sans classification), statut des séries, et le bouton de scan de chaque bibliothèque.

### Contrôle parental

- **Âge maximal** : l'admin le règle pour chaque personne dans « Comptes », depuis le menu de l'avatar, parmi les âges de la grille.
- **Âge d'une série** : celui choisi dans l'éditeur (grille des réglages), sinon la classification la plus restrictive de ses tomes (`AgeRating` du ComicInfo).
- **Comptes limités** : ils ne voient que les séries classées sous leur limite. Une série sans classification leur est masquée, partout : liste, fiche, tomes, pages, couvertures, « Reprendre la lecture ».
- **Admins** : ils voient tout. « Voir comme un lecteur… », dans le menu de l'avatar, leur permet de **voir l'appli comme un compte lecteur** (ses séries, ses lectures, sa liste « À lire », en lecture seule : rien n'est enregistré, les boutons qui modifient sont grisés) ou comme un lecteur fictif d'un âge donné ; un bandeau permet de revenir à la vue admin.
- **Classifications** : les variantes du ComicInfo sont regroupées par âge (« 10 ans et + » regroupe « Everyone 10+ » et « PG », par exemple).

### Comptes et connexion

- **Comptes** : un identifiant (lettres, chiffres, `.`, `-`, `_` ; sans tenir compte des majuscules à la connexion), un mot de passe (8 caractères au moins), un avatar DiceBear « Clay » et un e-mail facultatif.
- **Invitations** : dans « Comptes » (menu de l'avatar), « Inviter » crée un lien pour un lecteur (avec son âge maximal) ou un admin, avec peut-être un identifiant proposé (modifiable à l'inscription). Bento n'envoie rien lui-même : le lien part par le menu de partage du téléphone, WhatsApp, texto, e-mail, ou se copie. Il sert une fois et vaut 7 jours ; les invitations en attente peuvent être annulées.
- **Mot de passe oublié** : l'admin crée un lien de nouveau mot de passe depuis le menu (⋮) du compte, envoyé de la même façon. L'admin y change aussi le rôle et supprime un compte (jamais le sien).
- **Avatar** : douze idées au hasard à côté de l'avatar (« Autres idées » pour en tirer d'autres), puis « Personnaliser », fermé au départ : un onglet par partie (corps, tête, motif, yeux, bouche) et les couleurs (corps, détails, fond), onglets de haut en bas. Tous les avatars bougent doucement (jamais si l'appareil réduit les animations). Un avatar d'avant reste tel quel et se modifie de la même façon.
- **Mon compte** (menu de l'avatar) : avatar, identifiant, e-mail, mot de passe (l'actuel est demandé).
- **Connexion** : page `/login`. Après 5 échecs en 15 minutes pour un identifiant, il faut attendre. Session de 30 jours dans un cookie `HttpOnly`, prolongée tant qu'elle sert. Mots de passe chiffrés par scrypt ; la base ne garde que l'empreinte des jetons de session et des liens. Seuls `/api/health`, `/api/appearance`, `/api/avatars/*` et `/api/auth/*` sont accessibles sans session.
- **Comptes venus de Pocket ID** (avant novembre 2026) : gardés avec leurs lectures, marqués « À activer ». Encore connectés, ils voient un bandeau qui mène à « Mon compte » ; sinon l'admin leur envoie un lien d'activation (même page que l'invitation, identifiant proposé d'après leur nom).
- **Secours** : au démarrage, si aucun admin n'a de mot de passe, le journal donne un lien pour en choisir un. `pnpm --filter server admin-link [identifiant]` (dans Docker : `node apps/server/dist/adminLink.js`) donne un lien de nouveau mot de passe pour un admin.

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
    volumes:
      - ./bento:/config
      - /BLK/Books/Manga:/manga
```

Le conteneur tourne avec l'utilisateur `node` : il doit pouvoir écrire dans `/config` et dans les dossiers des bibliothèques (gestion des tomes).
