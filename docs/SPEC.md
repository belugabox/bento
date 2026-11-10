# Bento — spécification

Bento est le serveur de lecture et de gestion des mangas et BD de la maison. Il remplace Kavita : la famille y lit, l'admin y prépare et range les tomes.

## Contexte

- La gestion des mangas vivait jusqu'ici dans **beluga-box** (scraper Wikipédia, ComicInfo, publication, réparations, compression, lecteur). Bento la reprend dans une appli à part, réécrite proprement, en recopiant la logique éprouvée et ses tests :
  - scraper Wikipédia ;
  - lecture et écriture du ComicInfo ;
  - réparations ZIP/RAR ;
  - compression.
- **beluga-box** garde la seedbox et continue de synchroniser les tomes téléchargés dans le dossier `_draft` de la bibliothèque manga. Ce dossier est le seul lien entre les deux applis.
- **Connexion** gérée par Bento (identifiant et mot de passe, comptes créés sur invitation). Pocket ID a servi jusqu'en novembre 2026.
- **Kavita** : migration depuis sa base (comptes, progression, « à lire », dates d'ajout, temps de lecture), dans Réglages ; décidé le 9 novembre 2026 (on devait d'abord repartir de zéro).

## Périmètre

| | Dans Bento | Hors périmètre |
|---|---|---|
| Contenus | Mangas et BD/comics en CBZ | EPUB, PDF |
| Appareils | Navigateur, tablette et téléphone (appli installable), lecture hors ligne | Liseuses (OPDS) |
| Utilisateurs | L'admin (gestion) et la famille (lecture) | Accès public |
| Métadonnées | Wikipédia FR (mangas et BD), Manga-news (mangas), noms de fichiers, saisie | Bedetheque (bloque les robots) |

## Fonctionnalités

### A. Comptes et accès
- **Connexion** : identifiant et mot de passe, puis une session serveur dans un cookie `HttpOnly`.
- **Comptes** : un identifiant, un mot de passe, un avatar DiceBear « Clay » et un e-mail facultatif. L'admin envoie un **lien d'inscription** (partage du téléphone, WhatsApp, texto, e-mail) avec le rôle (admin ou lecteur) et la **classification d'âge maximale**, modifiables ensuite. Mot de passe oublié : l'admin envoie un lien de nouveau mot de passe.

### B. Bibliothèques et indexation
- **Plusieurs bibliothèques**, chacune avec un nom, un dossier, et un type (manga ou BD). La lecture se fait de gauche à droite par défaut, pour toutes les bibliothèques.
- **Scan** : il indexe les séries et les tomes en base (ComicInfo, nombre de pages, taille, dates) et génère les vignettes de couverture.
  - Il se relance à la demande, périodiquement, et après chaque publication.
- **Brouillons** : un dossier `_draft` par bibliothèque pour les tomes à préparer. Les lecteurs ne le voient pas.

### C. Parcourir (tous)
- **Accueil** : reprendre la lecture, nouveaux tomes ajoutés, suite des séries entamées.
- **Grille de séries** avec leurs couvertures.
- **Recherche et filtres** : par bibliothèque, par genre, par statut de la série (en cours ou terminée), et par état de lecture (lu, en cours, non lu).
- **Fiche série** : résumé, genre, années, et liste des tomes avec leur état de lecture.
- **Contrôle parental** : un lecteur ne voit que les séries dont la classification (`AgeRating`) est sous sa limite. Une série sans classification est masquée pour un compte limité.

### D. Lecteur (tous)
- **Mode de lecture**, fixé par série par l'admin et modifiable par chacun : BD (gauche → droite), manga de gauche à droite (doubles pages inversées), manga de droite à gauche, ou webtoon (défilement vertical).
- **Modes d'affichage** :
  - page simple ;
  - double page en paysage, en gérant les doubles pages déjà fusionnées dans l'archive ;
  - défilement vertical, pour les webtoons.
- **Ajustement** : à la largeur, à la hauteur ou en taille réelle, avec zoom à la souris et au doigt.
- **Navigation** :
  - gestes tactiles (balayage), clavier et barre de navigation ;
  - préchargement des pages voisines ;
  - images redimensionnées selon l'écran.

### E. Suivi de lecture (tous)
- **Progression** par tome et par personne : page atteinte, tome lu ou en cours. Elle est synchronisée entre les appareils.
- **Listes** :
  - une liste « à lire » personnelle (les favoris, trop proches, ont été retirés, puis les collections partagées).

### F. Gestion (admin)
- **Brouillons** : liste des tomes et fiche de chaque tome avec sa couverture et son ComicInfo modifiable.
- **Réglages de la future série dès les brouillons** : statut, mode de lecture et couverture, appliqués à la publication.
- **Métadonnées** : recherche sur Wikipédia FR et Manga-news à la fois, comparaison champ par champ (valeur actuelle ou celle d'une fiche, site préféré par champ dans les réglages), lien des fiches gardé pour les relire, remplissage depuis les noms de fichiers, suggestions des noms déjà connus.
- **Classement** : format obligatoire, pris dans une liste gérée par l'admin (chacun avec son mode de lecture), et âge pris dans une grille réglable (Tout public, 8+, 10+, 12+, 14+, 16+, 18+ au départ), gardés dans Bento ; genres d'une liste gérée par l'admin (avec les autres noms qu'ils reconnaissent) et thèmes libres, dans `Genre` et `Tags` du ComicInfo.
- **Manga-news** (fait pour les séries) : deuxième source de « Remplir », par défaut pour les mangas.
  - Série : auteurs, traducteurs, éditeurs VF et VO, type, genres, origine et année, **âge conseillé** (classification), résumé.
  - Tomes (pas encore fait) : année, titre et résumé de chaque tome, d'après leurs pages.
  - Pas d'API : lecture du HTML, à la demande seulement (jamais d'aspiration en masse), avec des tests sur des pages enregistrées. Si le site affiche un contrôle anti-robot (Cloudflare), Bento ne le contourne pas : Wikipédia reste disponible.
- **Publication** : rangement en `Série/Série #NN (Année).cbz`, l'année étant facultative.
  - Ajout de tomes à une série existante.
  - Remplacement d'un tome de même numéro.
  - Déplacement des tomes quand la série change de nom.
- **Réparation des archives** :
  - conversion CBR → CBZ, et réécriture des RAR déguisés en CBZ ;
  - correction des ZIP aux descripteurs abîmés ;
  - diagnostic lisible des archives illisibles ;
  - une archive en échec ne bloque pas les autres.
- **Compression** des images, avec une estimation du gain avant de lancer.
- **Tomes manquants et sorties** : trous dans la numérotation, et tomes parus d'après Wikipédia (nombre de volumes, dernier volume) mais absents de la bibliothèque.

### G. Hors ligne (tous)
- **Appli installable** sur tablette et téléphone (PWA).
- **Téléchargement** de tomes sur l'appareil, pour les lire sans réseau. L'appli indique la place qu'ils occupent et permet d'en libérer.
- **Progression hors ligne** : elle est mise en file d'attente, puis resynchronisée dès le retour du réseau.

## Architecture

- **Monorepo pnpm**, comme beluga-box :
  - `apps/server` : Node 22, Hono, zod ;
  - `apps/client` : React, Mantine, Vite avec le plugin PWA.
- **Base SQLite**, avec l'ORM Drizzle et ses migrations. Elle stocke :
  - les utilisateurs et les bibliothèques ;
  - les séries et les tomes ;
  - la progression et les listes.
- **Images** : vignettes et images redimensionnées gardées dans un cache disque, générées avec sharp. Le navigateur garde pages et couvertures un an : leur adresse contient la version du tome (date du fichier), qui change à chaque réécriture.
- **Déploiement** :
  - image Docker `ghcr.io/belugabox/bento`, publiée par GitHub Actions ;
  - volume `/config` pour la config, la base et le cache, plus un volume par dossier de bibliothèque ;
  - un sous-domaine derrière Cloudflare.

## Feuille de route

État au 6 novembre 2026 : Bento est déployé (`https://bento.belugabox.net`), Kavita tourne encore.

1. **Socle de lecture** — fait : dépôt, connexion (Pocket ID, puis comptes propres à Bento en novembre 2026), bibliothèques, scan (à la demande, toutes les 30 min, après publication), grille et fiche série, lecteur, progression.
2. **Gestion** — fait : brouillons, métadonnées, Wikipédia, publication, réparations, couvertures, statut et mode de lecture dès les brouillons, aperçu de lecture, compression des images.
3. **Famille** — fait : contrôle parental, vue lecteur pour l'admin, thèmes, statistiques, série lue / non lue, liste « à lire », filtres par liste, genre et statut, la suite des séries entamées dans « Reprendre la lecture » (« Nouveautés » retirée pour l'instant, à revoir).
4. **Tablettes et Android** — fait, à essayer sur les appareils :
   - **plein écran du lecteur** : bouton dans la barre du lecteur, et option « Plein écran à l'ouverture » (au premier toucher, le navigateur l'exige) ; il continue d'un tome au suivant ;
   - **appli web installable** : manifeste et icônes (boîte à bento violette), pour « Installer l'application » dans Chrome sur Android et « Sur l'écran d'accueil » sur iPad. Pas encore de service worker : le hors ligne reste pour l'étape 9.
5. **Lecteur avancé** — fait : double page, modes BD / manga / webtoon, gestes tactiles, zoom. Reste : images redimensionnées selon l'écran (les pages sont servies en taille d'origine).
6. **Manga-news** — fait pour les séries (voir F), avec le classement par format, genres gérés et thèmes. Reste : les fiches des tomes.
7. **Fiches à compléter** — fait :
   - **Complétude d'une série**, en pourcentage : part des informations remplies (nom, format, âge, statut, genres, scénario, dessin, éditeur, résumé, numéro et année de chaque tome au prorata). La couverture n'y compte pas : chaque série en a une, celle de son premier tome. Affichée dans l'éditeur (brouillons et séries, mise à jour pendant la saisie), et sur la fiche série pour l'admin tant qu'elle n'est pas à 100 %, avec la liste de ce qui manque.
   - **Taille totale d'une série** : somme des fichiers de ses tomes, sur la fiche série et dans les brouillons.
   - **Séries à classer** (devenue « Séries » le 10 novembre 2026 : toutes les séries en cartes, classement sur la carte, tri et filtres) : liste des séries sans format ou sans âge (masquées aux comptes limités), avec un lien vers leur éditeur et un bouton Manga-news par série (sur clic, jamais en masse), puis « Enregistrer et suivante » dans l'éditeur.
8. **Suggestions** : proposer des séries à lire, d'après les genres, les thèmes et les lectures de la famille, sans service extérieur. Elles marchent d'autant mieux que les séries sont classées.
   - **« Dans le même genre »** sur la fiche série : genres en commun (beaucoup), thèmes en commun (un peu), même format (un petit bonus) ; les séries déjà lues après les autres.
   - **« Lu par la famille »** sur l'accueil : séries finies ou bien avancées par un autre membre, pas commencées par la personne (« Léo a fini Mashle »).
   - **« Pour toi »** sur l'accueil, ensuite : d'après les genres et thèmes des séries lues ou commencées (pondérés par les tomes lus), séries pas commencées, avec la raison (« Parce que tu as lu Spy × Family »).
   - Plus tard : 👍 / 👎 dans le menu ⋮ pour affiner, nouveautés dans les genres préférés, séries courtes ou terminées pour une lecture rapide.
   - Toujours dans la limite d'âge du compte.
9. **Hors ligne** (commencé le 10 novembre 2026, branche `feat/offline` ; appareil visé : tablette Android). Avec le reste de l'étape 5 :
   1. **Pages à la taille de l'écran** : le serveur sert chaque page réduite à quelques largeurs fixes (WebP), calculée une fois et gardée sur disque (cache plafonné, les plus anciennes effacées) ; le lecteur choisit la largeur d'après l'écran. Tomes téléchargés trois fois plus légers.
   2. **Bento sans réseau** : service worker (application gardée sur l'appareil), bandeau « Hors ligne ».
   3. **Téléchargements** : « Télécharger » dans le menu ⋮ d'un tome, « Télécharger les tomes suivants » sur la fiche série ; pages et infos de lecture dans le stockage du navigateur (rendu persistant) ; page « Téléchargements » (place prise et libre, suppression, tomes lus) ; icône sur les cartes.
   4. **Lecture hors ligne** : pages téléchargées d'abord ; accueil hors ligne réduit aux tomes téléchargés.
   5. **Progression hors ligne** : file sur l'appareil (pages, tomes finis, temps de lecture), envoyée au retour du réseau ; la lecture la plus récente gagne (heure réelle envoyée).
   6. **Automatique** (option de l'appareil) : les tomes suivants des séries en cours téléchargés en Wi-Fi ; tomes lus effacés après 30 jours.
   - Téléchargements liés au compte : effacés à la déconnexion (appareil partagé, contrôle parental). Pas de téléchargement en vue lecteur (simulation).
10. **Tomes manquants et sorties** : trous dans la numérotation, tomes parus (Wikipédia, puis manga-news) absents de la bibliothèque.
11. **Bascule** : retirer le module manga de beluga-box (la synchro vers `_draft` reste en place), arrêter Kavita.

## Décisions de déploiement

- **Adresse de Bento** : `https://bento.belugabox.net`.
- **Bibliothèques** :
  - Mangas : `/BLK/Books/Manga`.
  - BD : pas de dossier sur le serveur pour l'instant. La bibliothèque BD sera ajoutée quand elle en aura un ; en attendant, elle est testée en local.
