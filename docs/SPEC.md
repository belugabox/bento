# Bento — spécification

Bento est le serveur de lecture et de gestion des mangas et BD de la maison. Il remplace Kavita : la famille y lit, l'admin y prépare et range les tomes.

## Contexte

- La gestion des mangas vivait jusqu'ici dans **beluga-box** (scraper Wikipédia, ComicInfo, publication, réparations, compression, lecteur). Bento la reprend dans une appli à part, réécrite proprement, en recopiant la logique éprouvée et ses tests :
  - scraper Wikipédia ;
  - lecture et écriture du ComicInfo ;
  - réparations ZIP/RAR ;
  - compression.
- **beluga-box** garde la seedbox et continue de synchroniser les tomes téléchargés dans le dossier `_draft` de la bibliothèque manga. Ce dossier est le seul lien entre les deux applis.
- **Connexion** par **Pocket ID**, déjà en place, en OIDC. Bento ne stocke aucun mot de passe.
- **Kavita** : on repart de zéro, sans reprendre la progression de lecture.

## Périmètre

| | Dans Bento | Hors périmètre |
|---|---|---|
| Contenus | Mangas et BD/comics en CBZ | EPUB, PDF |
| Appareils | Navigateur, tablette et téléphone (appli installable), lecture hors ligne | Liseuses (OPDS) |
| Utilisateurs | L'admin (gestion) et la famille (lecture) | Accès public |
| Métadonnées | Wikipédia FR (mangas et BD), manga-news (mangas, prévu), noms de fichiers, saisie | Bedetheque (bloque les robots) |

## Fonctionnalités

### A. Comptes et accès
- **Connexion** : OIDC avec Pocket ID (flux par code avec PKCE). Bento garde ensuite une session serveur dans un cookie `HttpOnly`.
- **Rôles**, selon le groupe Pocket ID :
  - `bento-admins` donne le rôle admin ;
  - `bento-readers` donne le rôle lecteur ;
  - sans l'un de ces groupes, l'accès est refusé.
- **Comptes** : chaque compte Bento est créé à la première connexion. L'admin règle ensuite pour chacun la **classification d'âge maximale**.

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
  - une liste « à lire » personnelle (les favoris, trop proches, ont été retirés) ;
  - des collections partagées créées par l'admin, par exemple « Pour les enfants ».

### F. Gestion (admin)
- **Brouillons** : liste des tomes et fiche de chaque tome avec sa couverture et son ComicInfo modifiable.
- **Réglages de la future série dès les brouillons** : statut, mode de lecture et couverture, appliqués à la publication.
- **Métadonnées** : recherche Wikipédia FR, remplissage depuis les noms de fichiers, option « écraser les valeurs existantes ».
- **Classement** : format (manga, manhwa, manhua, webtoon, BD, comics) et public (jeunesse, shonen, shojo, seinen, josei) gardés dans Bento ; genres d'une liste gérée par l'admin (avec les autres noms qu'ils reconnaissent) et thèmes libres, dans `Genre` et `Tags` du ComicInfo.
- **Manga-news** (prévu) : deuxième source de « Remplir », par défaut pour les mangas.
  - Série : auteurs, traducteurs, éditeurs VF et VO, type, genres, origine et année, **âge conseillé** (classification), résumé.
  - Tomes : année, titre et résumé de chaque tome, d'après leurs pages.
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
  - la progression, les listes et les collections.
- **Images** : vignettes et images redimensionnées gardées dans un cache disque, générées avec sharp. Le navigateur garde pages et couvertures un an : leur adresse contient la version du tome (date du fichier), qui change à chaque réécriture.
- **Déploiement** :
  - image Docker `ghcr.io/belugabox/bento`, publiée par GitHub Actions ;
  - volume `/config` pour la config, la base et le cache, plus un volume par dossier de bibliothèque ;
  - un sous-domaine derrière Cloudflare.

## Feuille de route

État au 6 novembre 2026 : Bento est déployé (`https://bento.belugabox.net`), Kavita tourne encore.

1. **Socle de lecture** — fait : dépôt, connexion Pocket ID, bibliothèques, scan (à la demande, toutes les 30 min, après publication), grille et fiche série, lecteur, progression.
2. **Gestion** — fait : brouillons, métadonnées, Wikipédia, publication, réparations, couvertures, statut et mode de lecture dès les brouillons, aperçu de lecture, compression des images.
3. **Famille** — fait : contrôle parental, vue lecteur pour l'admin, thèmes, statistiques, série lue / non lue, liste « à lire », collections partagées, filtres par liste, genre et statut, la suite des séries entamées dans « Reprendre la lecture » (« Nouveautés » retirée pour l'instant, à revoir).
4. **Tablettes et Android** — fait, à essayer sur les appareils :
   - **plein écran du lecteur** : bouton dans la barre du lecteur, et option « Plein écran à l'ouverture » (au premier toucher, le navigateur l'exige) ; il continue d'un tome au suivant ;
   - **appli web installable** : manifeste et icônes (boîte à bento violette), pour « Installer l'application » dans Chrome sur Android et « Sur l'écran d'accueil » sur iPad. Pas encore de service worker : le hors ligne reste pour l'étape 7.
5. **Lecteur avancé** — fait : double page, modes BD / manga / webtoon, gestes tactiles, zoom. Reste : images redimensionnées selon l'écran (les pages sont servies en taille d'origine).
6. **Manga-news** : deuxième source de métadonnées pour les mangas (voir F).
7. **Hors ligne** : téléchargements, lecture sans réseau, synchronisation de la progression.
8. **Tomes manquants et sorties** : trous dans la numérotation, tomes parus (Wikipédia, puis manga-news) absents de la bibliothèque.
9. **Bascule** : retirer le module manga de beluga-box (la synchro vers `_draft` reste en place), arrêter Kavita.

## Décisions de déploiement

- **Pocket ID** : `https://auth.belugabox.net`, avec les groupes `bento-admins` et `bento-readers`.
- **Adresse de Bento** : `https://bento.belugabox.net`.
- **Bibliothèques** :
  - Mangas : `/BLK/Books/Manga`.
  - BD : pas de dossier sur le serveur pour l'instant. La bibliothèque BD sera ajoutée quand elle en aura un ; en attendant, elle est testée en local.
