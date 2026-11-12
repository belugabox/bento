import { hc } from 'hono/client';

import {
    type ApiType,
    type ReadingMode,
    type SourceLink,
    formatAvatar,
    pageWidthFor,
    randomAvatar,
} from '@server/types';

import { reachServer } from './network';

/** Client typé de l'API (`/api`, servie par le même domaine). */
export const api = hc<ApiType>('/api');

/** Page de connexion, avec retour sur la page actuelle. */
export const loginUrl = (
    redirect = window.location.pathname + window.location.search,
) => `/login?redirect=${encodeURIComponent(redirect)}`;

/** Résultat JSON d'un appel, ou erreur avec le message renvoyé par le serveur. */
export const json = async <T>(
    call: Promise<{ ok: boolean; status: number; json(): Promise<T> }>,
): Promise<T> => {
    // Sans réponse du serveur : `NetworkError`, et l'appli passe hors ligne.
    const response = await reachServer(() => call);
    // Session absente ou expirée : passer par la page de connexion.
    if (response.status === 401) {
        window.location.assign(loginUrl());
        throw new Error('Connexion requise');
    }
    if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
            message?: string;
        };
        throw new Error(body.message ?? `Erreur ${response.status}`);
    }
    return response.json();
};

const id = (value: number) => ({ param: { id: String(value) } });

export const fetchLibraries = () => json(api.libraries.$get());

export const scanLibrary = (libraryId: number) =>
    json(api.libraries[':id'].scan.$post(id(libraryId)));

export const fetchSeriesList = ({
    libraryId,
    search,
}: { libraryId?: number; search?: string } = {}) =>
    json(
        api.series.$get({
            query: {
                ...(libraryId !== undefined && {
                    libraryId: String(libraryId),
                }),
                ...(search && { search }),
            },
        }),
    );

export const fetchSeries = (seriesId: number) =>
    json(api.series[':id'].$get(id(seriesId)));

/** Les autres comptes qui ont lu la série (« Lu par »). */
export const fetchSeriesReaders = (seriesId: number) =>
    json(api.series[':id'].readers.$get(id(seriesId)));

/** Temps passé dans le lecteur sur un tome (statistiques). */
export const sendReadingTime = (
    volumeId: number,
    // `at` : heure réelle d'une lecture faite hors ligne (ms).
    time: { seconds: number; pages: number; at?: number },
) =>
    json(
        api.volumes[':id']['reading-time'].$post({
            ...id(volumeId),
            json: time,
        }),
    );

/** Migration Kavita : analyse de la base envoyée (null : rien envoyé). */
export const fetchKavitaMigration = () => json(api.migration.kavita.$get());

export type KavitaAnalysis = NonNullable<
    Awaited<ReturnType<typeof fetchKavitaMigration>>['analysis']
>;

/** Envoie kavita.db (et ses -wal et -shm), puis renvoie l'analyse. */
export const uploadKavita = (files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    return json<{ analysis: KavitaAnalysis }>(
        fetch('/api/migration/kavita', { method: 'POST', body: form }),
    );
};

export const applyKavita = (choices: {
    accounts: (
        | { kavitaId: number; action: 'link'; userId: number }
        | {
              kavitaId: number;
              action: 'create';
              name: string;
              maxAge: number | null;
          }
        | { kavitaId: number; action: 'skip' }
    )[];
    addedDates: boolean;
    readingTime: boolean;
    estimatedSessions: boolean;
    fillGaps: boolean;
}) => json(api.migration.kavita.apply.$post({ json: choices }));

export const clearKavita = () => json(api.migration.kavita.$delete());

/** Filtre « Lu par » de l'accueil : les autres comptes et leurs séries lues. */
export const fetchFamilyReaders = () => json(api.readers.$get());

export type FamilyReader = Awaited<
    ReturnType<typeof fetchFamilyReaders>
>[number];

export type SeriesReader = Awaited<
    ReturnType<typeof fetchSeriesReaders>
>[number];

export const fetchVolume = (volumeId: number) =>
    json(api.volumes[':id'].$get(id(volumeId)));

export type Library = Awaited<ReturnType<typeof fetchLibraries>>[number];
export type SeriesSummary = Awaited<ReturnType<typeof fetchSeriesList>>[number];
export type SeriesDetails = Awaited<ReturnType<typeof fetchSeries>>;
export type Volume = Awaited<ReturnType<typeof fetchVolume>>;

// Images servies telles quelles : utilisables directement dans <img>.
// La version du tome dans l'adresse permet au navigateur de les garder : elle
// change quand le fichier est réécrit. `small` : version réduite (vignettes
// des grilles), plus légère.
export const coverUrl = (volumeId: number, version: number, size?: 'small') =>
    `/api/volumes/${volumeId}/cover?v=${version}${size ? `&size=${size}` : ''}`;
/**
 * Page d'un tome ; avec `width`, réduite à cette largeur par le serveur
 * (une des largeurs prévues, voir `screenPageWidth`).
 */
export const pageUrl = (
    volumeId: number,
    version: number,
    index: number,
    width?: number,
) =>
    `/api/volumes/${volumeId}/pages/${index}?v=${version}${width ? `&w=${width}` : ''}`;

/**
 * Largeur des pages pour cet écran (petit côté en pixels réels), ou
 * `undefined` pour la page d'origine (écran plus grand que les largeurs
 * prévues).
 */
export const screenPageWidth = () =>
    pageWidthFor({
        width: window.screen.width,
        height: window.screen.height,
        pixelRatio: window.devicePixelRatio,
    });

export const saveProgress = (
    volumeId: number,
    // `at` : heure réelle d'une lecture faite hors ligne (ms).
    progress: { page?: number; completed?: boolean; at?: number },
) =>
    json(
        api.volumes[':id'].progress.$put({
            ...id(volumeId),
            json: progress,
        }),
    );

/** « Reprendre la lecture » : tomes en cours, ou suivants à ouvrir. */
export const fetchInProgress = () => json(api.continue.$get());

export type InProgressVolume = Awaited<
    ReturnType<typeof fetchInProgress>
>[number];

/** Liste « à lire » de la personne. */
export const setSeriesLists = (seriesId: number, lists: { toRead?: boolean }) =>
    json(api.series[':id'].lists.$put({ ...id(seriesId), json: lists }));

// --- Comptes -------------------------------------------------------------------

export const login = (username: string, password: string) =>
    json(api.auth.login.$post({ json: { username, password } }));

/** Ce qu'affiche la page d'un lien d'invitation, d'activation… */
export const fetchLink = (token: string) =>
    json(api.auth.links[':token'].$get({ param: { token } }));

export type LinkInfo = Awaited<ReturnType<typeof fetchLink>>;

export const submitLink = (
    token: string,
    form: {
        username?: string;
        password: string;
        email?: string | null;
        avatarSeed?: string;
    },
) => json(api.auth.links[':token'].$post({ param: { token }, json: form }));

/** « Mon compte » : identifiant, e-mail, avatar, mot de passe. */
export const updateMe = (changes: {
    username?: string;
    email?: string | null;
    avatarSeed?: string;
    password?: string;
    currentPassword?: string;
}) => json(api.me.$patch({ json: changes }));

/**
 * Version du dessin des avatars (gardés un an par le navigateur) : à changer
 * quand le serveur les dessine autrement (`auth/avatar.ts`).
 */
const AVATAR_VERSION = 2;

/** Avatar DiceBear « Clay » : graine au hasard ou avatar composé. */
export const avatarUrl = (seed: string) =>
    `/api/avatars/${encodeURIComponent(seed)}?v=${AVATAR_VERSION}`;

/** Avatar composé au hasard. */
export const randomAvatarSeed = () => formatAvatar(randomAvatar());

/** Parties d'un avatar, pour le modifier (aussi celles d'une graine). */
export const fetchAvatarChoice = (seed: string) =>
    json(api.avatars[':seed'].choice.$get({ param: { seed } }));

/** Adresse complète d'un lien d'invitation, d'activation… */
export const joinUrl = (token: string) =>
    `${window.location.origin}/join/${token}`;

export const fetchUsers = () => json(api.users.$get());

export type Account = Awaited<ReturnType<typeof fetchUsers>>[number];

export const updateUser = (
    userId: number,
    changes: { maxAge?: number | null; role?: 'admin' | 'reader' },
) => json(api.users[':id'].$patch({ ...id(userId), json: changes }));

export const deleteUser = (userId: number) =>
    json(api.users[':id'].$delete(id(userId)));

/** Lien d'activation ou de nouveau mot de passe d'un compte. */
export const createUserLink = (userId: number) =>
    json(api.users[':id'].link.$post(id(userId)));

export const fetchInvitations = () => json(api.invitations.$get());

export type Invitation = Awaited<ReturnType<typeof fetchInvitations>>[number];

export const createInvitation = (invitation: {
    role: 'admin' | 'reader';
    maxAge: number | null;
    username?: string | null;
}) => json(api.invitations.$post({ json: invitation }));

export const deleteInvitation = (invitationId: number) =>
    json(api.invitations[':id'].$delete(id(invitationId)));

/** Largeur et hauteur de chaque page (double page). */
export const fetchPageSizes = (volumeId: number) =>
    json(api.volumes[':id']['page-sizes'].$get(id(volumeId)));

// --- Gestion des fichiers (admin) -------------------------------------------

const libraryId = (value: number) => ({ param: { id: String(value) } });

export const fetchDrafts = (library: number) =>
    json(api.libraries[':id'].drafts.$get(libraryId(library)));

export type DraftFolder = Awaited<ReturnType<typeof fetchDrafts>>[number];

/** Fichiers d'un dossier de brouillons, avec leur ComicInfo (archives lues). */
export const fetchDraftFolder = (library: number, folder: string) =>
    json(
        api.libraries[':id'].drafts.files.$get({
            ...libraryId(library),
            query: { folder },
        }),
    );

export type LibraryFile = Awaited<ReturnType<typeof fetchDraftFolder>>[number];

export const saveComicInfo = (
    library: number,
    updates: {
        path: string;
        changes: Record<string, string | number | null>;
    }[],
) =>
    json(
        api.libraries[':id'].files['comic-info'].$put({
            ...libraryId(library),
            json: { updates },
        }),
    );

export const publishFiles = (library: number, paths: string[]) =>
    json(
        api.libraries[':id'].files.publish.$post({
            ...libraryId(library),
            json: { paths },
        }),
    );

/** Page d'un fichier de la bibliothèque (brouillon compris). */
export const filePageUrl = (library: number, path: string, index: number) =>
    `/api/libraries/${library}/files/pages/${index}?path=${encodeURIComponent(path)}`;

/** Dimensions des pages d'un fichier (aperçu du lecteur). */
export const fetchFilePageSizes = (library: number, path: string) =>
    json(
        api.libraries[':id'].files['page-sizes'].$get({
            ...libraryId(library),
            query: { path },
        }),
    );

/**
 * Gain estimé en compressant les pages de fichiers (les tomes d'une série,
 * estimés ensemble), par chemin.
 */
export const estimateCompression = (library: number, paths: string[]) =>
    json(
        api.libraries[':id'].files.compression.estimate.$post({
            ...libraryId(library),
            json: { paths },
        }),
    );

/** Compression en arrière-plan : ajout à la file du serveur. */
export const startCompression = (library: number, paths: string[]) =>
    json(
        api.libraries[':id'].files.compress.$post({
            ...libraryId(library),
            json: { paths },
        }),
    );

/** Réglages de l'admin, avec leurs valeurs par défaut. */
export const fetchSettings = () => json(api.settings.$get());

export type SettingsResponse = Awaited<ReturnType<typeof fetchSettings>>;
export type Settings = SettingsResponse['settings'];

export const saveSettings = (changes: {
    compression?: Partial<Settings['compression']>;
    scanIntervalMinutes?: number;
    appearance?: Partial<Settings['appearance']>;
    ages?: number[];
    sourcePriority?: Partial<Settings['sourcePriority']>;
    disabledSources?: Settings['disabledSources'];
    sheetRefresh?: boolean;
    sheetRefreshMinutes?: number;
    readByPercent?: number;
}) => json(api.settings.$put({ json: changes }));

/** Mise à jour des fiches liées, la nuit : état, et « Lancer maintenant ». */
export const fetchSheetRefresh = () => json(api.metadata.refresh.$get());
export const runSheetRefresh = () => json(api.metadata.refresh.$post());

/** Thème par défaut choisi par l'admin (lisible sans session). */
export const fetchAppearance = () => json(api.appearance.$get());

export const fetchCompression = () => json(api.compression.$get());

export const clearCompression = () => json(api.compression.$delete());

export type CompressionJob = Awaited<
    ReturnType<typeof fetchCompression>
>['jobs'][number];

/** Couverture d'un fichier (brouillon), à recharger quand il change. */
export const fileCoverUrl = (library: number, path: string, version = '') =>
    `/api/libraries/${library}/files/cover?path=${encodeURIComponent(path)}&v=${encodeURIComponent(version)}`;

// --- Métadonnées et couvertures (admin) ----------------------------------------

/** Séries de Wikipédia FR (mangas et bandes dessinées) pour ce texte. */
export const searchWikipedia = (q: string) =>
    json(api.metadata.wikipedia.search.$get({ query: { q } }));

/** Séries de Bedetheque (BD, comics, romans graphiques) pour ce texte. */
export const searchBedetheque = (q: string) =>
    json(api.metadata.bedetheque.search.$get({ query: { q } }));

/** Albums d'une série sur Bedetheque : numéro, titre, année. */
export const fetchBedethequeVolumes = (bedethequeId: string) =>
    json(api.metadata.bedetheque.volumes.$get({ query: { id: bedethequeId } }));

/** Tomes d'une série sur Wikipédia : numéro, année de sortie en France. */
export const fetchWikipediaVolumes = (wikiId: number) =>
    json(api.metadata.wikipedia[':id'].volumes.$get(id(wikiId)));

/** Fiche d'une série sur Bedetheque, par son identifiant. */
export const fetchBedethequeSeries = (bedethequeId: string) =>
    json(api.metadata.bedetheque.series.$get({ query: { id: bedethequeId } }));

export type BedethequeDetails = Awaited<
    ReturnType<typeof fetchBedethequeSeries>
>;

export const fetchWikipediaSeries = (wikiId: number) =>
    json(api.metadata.wikipedia[':id'].$get(id(wikiId)));

export type WikipediaResult = Awaited<
    ReturnType<typeof searchWikipedia>
>[number];
export type WikipediaDetails = Awaited<ReturnType<typeof fetchWikipediaSeries>>;

export const searchMangaNews = (q: string) =>
    json(api.metadata['manga-news'].search.$get({ query: { q } }));

/** Fiche Manga-news, par la fin de son adresse (« Spy-X-Family »). */
export const fetchMangaNewsSeries = (seriesId: string) =>
    json(api.metadata['manga-news'].series.$get({ query: { id: seriesId } }));

export type MangaNewsResult = Awaited<
    ReturnType<typeof searchMangaNews>
>[number];
export type MangaNewsDetails = Awaited<ReturnType<typeof fetchMangaNewsSeries>>;

/** Partie gardée de l'image, recadrée en 2:3. */
export type CoverPosition = 'top' | 'center' | 'bottom';

export type CoverSource = (
    | { type: 'volume'; volumeId: number; page?: number }
    | { type: 'file'; path: string; page?: number }
    | { type: 'url'; url: string }
    // Image envoyée depuis l'appareil, en base64.
    | { type: 'image'; data: string }
    | { type: 'default' }
) & { position?: CoverPosition };

export const setSeriesCover = (seriesId: number, source: CoverSource) =>
    json(
        api.series[':id'].cover.$put({
            ...id(seriesId),
            json: source,
        }),
    );

/** Couverture de la future série d'un dossier de brouillons. */
export const setDraftCover = (
    library: number,
    folder: string,
    source: CoverSource,
) =>
    json(
        api.libraries[':id'].drafts.cover.$put({
            ...libraryId(library),
            query: { folder },
            json: source,
        }),
    );

export const draftCoverUrl = (
    library: number,
    folder: string,
    coverUpdatedAt: string,
) =>
    `/api/libraries/${library}/drafts/cover?folder=${encodeURIComponent(folder)}&v=${encodeURIComponent(coverUpdatedAt)}`;

/** Couverture d'une série ; l'adresse change avec la couverture choisie. */
export const seriesCoverUrl = (
    series: {
        id: number;
        coverUpdatedAt: string | null;
        coverVolumeId?: number | null;
        coverVolumeVersion?: number | null;
    },
    size?: 'small',
) =>
    `/api/series/${series.id}/cover?v=${encodeURIComponent(series.coverUpdatedAt ?? `${series.coverVolumeId ?? ''}-${series.coverVolumeVersion ?? ''}`)}${size ? `&size=${size}` : ''}`;

/** Séries en attente dans les brouillons (pastille de l'en-tête). */
export const fetchPendingDrafts = () => json(api.drafts.pending.$get());

/** Tâches de fond en cours : scan, compression… (icône de l'en-tête). */
export const fetchTasks = () => json(api.tasks.$get());

export type Task = Awaited<ReturnType<typeof fetchTasks>>[number];

/** Vue lecteur d'un admin : âge maximal (null : sans limite). */
export const startPreview = (maxAge: number | null) =>
    json(api.preview.$put({ json: { maxAge } }));

/** Vue lecteur d'un admin : un compte simulé, en lecture seule. */
export const startSimulation = (userId: number) =>
    json(api.preview.$put({ json: { userId } }));

/** Comptes que l'admin peut simuler (les lecteurs). */
export const fetchSimulableAccounts = () => json(api.preview.accounts.$get());

export const stopPreview = () => json(api.preview.$delete());

export const setSeriesStatus = (
    seriesId: number,
    status: 'ongoing' | 'completed' | null,
) => json(api.series[':id'].status.$put({ ...id(seriesId), json: { status } }));

/** Gestion des séries (admin) : toutes, avec taille, pages et fiche. */
export const fetchManagedSeries = () => json(api.manage.series.$get());

/** Fiche qui donne le nombre de tomes parus ; null : automatique. */
export const setVolumeCountSite = (
    seriesId: number,
    site: 'manga-news' | 'bedetheque' | null,
) =>
    json(
        api.manage.series[':id']['volume-count-site'].$put({
            param: { id: String(seriesId) },
            json: { site },
        }),
    );

/** Fiche proposée (trouvée la nuit) : liée à la série, ou refusée. */
export const answerSheetProposal = (
    seriesId: number,
    proposal: { site: 'manga-news' | 'bedetheque'; id: string },
    accept: boolean,
) =>
    json(
        api.manage.series[':id'].proposals.$post({
            param: { id: String(seriesId) },
            json: { site: proposal.site, id: proposal.id, accept },
        }),
    );

export type ManagedSeries = Awaited<
    ReturnType<typeof fetchManagedSeries>
>[number];

/** Nombre de séries à classer (menu de l'admin). */
export const fetchToClassifyCount = () =>
    json(api.manage.series['to-classify'].$get());

/** Statistiques de la bibliothèque et de la lecture (admin). */
export const fetchStats = () => json(api.stats.$get());

export type Stats = Awaited<ReturnType<typeof fetchStats>>;

/** Statut de la future série d'un dossier de brouillons. */
export const setDraftStatus = (
    library: number,
    folder: string,
    status: 'ongoing' | 'completed' | null,
) =>
    json(
        api.libraries[':id'].drafts.status.$put({
            ...libraryId(library),
            json: { folder, status },
        }),
    );

/** Mode de lecture de la future série d'un dossier de brouillons. */
export const setDraftReadingMode = (
    library: number,
    folder: string,
    readingMode: 'ltr' | 'ltr-manga' | 'rtl' | 'webtoon' | null,
) =>
    json(
        api.libraries[':id'].drafts['reading-mode'].$put({
            ...libraryId(library),
            json: { folder, readingMode },
        }),
    );

/** Toute la série lue (`true`) ou non lue (progression effacée). */
/** Série lue ou non lue ; avec `upTo`, seulement jusqu'à ce tome. */
export const markSeriesRead = (
    seriesId: number,
    read: boolean,
    upTo?: number,
) =>
    json(
        api.series[':id'].read.$put({
            ...id(seriesId),
            json: { read, ...(upTo !== undefined && { upTo }) },
        }),
    );

/** Progression d'avant une action, renvoyée par le serveur pour l'annuler. */
export type SavedProgress = Awaited<
    ReturnType<typeof markSeriesRead>
>['previous'][number];

/** Annule une action : la progression redevient exactement celle d'avant. */
export const restoreProgress = (items: SavedProgress[]) =>
    json(api.progress.restore.$put({ json: { items } }));

/** Mode de lecture d'une série (null : celui de la bibliothèque). */
export const setSeriesReadingMode = (
    seriesId: number,
    readingMode: 'ltr' | 'ltr-manga' | 'rtl' | 'webtoon' | null,
) =>
    json(
        api.series[':id']['reading-mode'].$put({
            ...id(seriesId),
            json: { readingMode },
        }),
    );

/**
 * Format, âge et fiches en ligne d'une série ou d'un dossier de brouillons
 * (null, liste vide : aucun).
 */
export type ClassificationChanges = {
    formatId?: number | null;
    age?: number | null;
    sources?: SourceLink[];
};

export const setSeriesClassification = (
    seriesId: number,
    changes: ClassificationChanges,
) =>
    json(
        api.series[':id'].classification.$put({
            ...id(seriesId),
            json: changes,
        }),
    );

export const setDraftClassification = (
    library: number,
    folder: string,
    changes: ClassificationChanges,
) =>
    json(
        api.libraries[':id'].drafts.classification.$put({
            ...libraryId(library),
            json: { folder, ...changes },
        }),
    );

/** Noms déjà connus dans la bibliothèque (suggestions de l'éditeur). */
export const fetchCredits = (library: number) =>
    json(api.libraries[':id'].credits.$get(libraryId(library)));

export type Credits = Awaited<ReturnType<typeof fetchCredits>>;

/** Liste des genres, gérée par l'admin. */
export const fetchGenres = () => json(api.genres.$get());

export type Genre = Awaited<ReturnType<typeof fetchGenres>>[number];

export const createGenre = (name: string, aliases: string[] = []) =>
    json(api.genres.$post({ json: { name, aliases } }));

export const updateGenre = (
    genreId: number,
    changes: { name?: string; aliases?: string[] },
) => json(api.genres[':id'].$patch({ ...id(genreId), json: changes }));

/** Supprime un genre, ou le fusionne dans `into`. */
export const deleteGenre = (genreId: number, into?: number) =>
    json(
        api.genres[':id'].$delete({
            ...id(genreId),
            query: { into: into === undefined ? undefined : String(into) },
        }),
    );

/** Formats de série (manga, BD…), gérés par l'admin. */
export const fetchFormats = () => json(api.formats.$get());

export type SeriesFormat = Awaited<ReturnType<typeof fetchFormats>>[number];

export const createFormat = (name: string, readingMode: ReadingMode) =>
    json(api.formats.$post({ json: { name, readingMode } }));

export const updateFormat = (
    formatId: number,
    changes: { name?: string; readingMode?: ReadingMode },
) => json(api.formats[':id'].$patch({ ...id(formatId), json: changes }));

export const deleteFormat = (formatId: number) =>
    json(api.formats[':id'].$delete(id(formatId)));
