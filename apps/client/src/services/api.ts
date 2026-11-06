import { hc } from 'hono/client';

import type { ApiType, Format } from '@server/types';

/** Client typé de l'API (`/api`, servie par le même domaine). */
export const api = hc<ApiType>('/api');

/** Page de connexion Pocket ID, avec retour sur la page actuelle. */
export const loginUrl = (
    redirect = window.location.pathname + window.location.search,
) => `/api/auth/login?redirect=${encodeURIComponent(redirect)}`;

/** Résultat JSON d'un appel, ou erreur avec le message renvoyé par le serveur. */
export const json = async <T>(
    call: Promise<{ ok: boolean; status: number; json(): Promise<T> }>,
): Promise<T> => {
    const response = await call;
    // Session absente ou expirée : passer par la connexion Pocket ID.
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
export const pageUrl = (volumeId: number, version: number, index: number) =>
    `/api/volumes/${volumeId}/pages/${index}?v=${version}`;

export const saveProgress = (
    volumeId: number,
    progress: { page?: number; completed?: boolean },
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

// --- Collections partagées ----------------------------------------------------

export const fetchCollections = () => json(api.collections.$get());

export type Collection = Awaited<ReturnType<typeof fetchCollections>>[number];

export const createCollection = (name: string) =>
    json(api.collections.$post({ json: { name } }));

export const renameCollection = (collectionId: number, name: string) =>
    json(
        api.collections[':id'].$patch({ ...id(collectionId), json: { name } }),
    );

export const deleteCollection = (collectionId: number) =>
    json(api.collections[':id'].$delete(id(collectionId)));

export const setCollectionMember = (
    collectionId: number,
    seriesId: number,
    member: boolean,
) =>
    json(
        api.collections[':id'].series[':seriesId'].$put({
            param: { id: String(collectionId), seriesId: String(seriesId) },
            json: { member },
        }),
    );

export const fetchUsers = () => json(api.users.$get());

export type Account = Awaited<ReturnType<typeof fetchUsers>>[number];

export const setUserMaxAge = (userId: number, maxAge: number | null) =>
    json(api.users[':id'].$patch({ ...id(userId), json: { maxAge } }));

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

/** Gain estimé en compressant les pages d'un fichier. */
export const estimateCompression = (library: number, path: string) =>
    json(
        api.libraries[':id'].files.compression.estimate.$post({
            ...libraryId(library),
            json: { path },
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
}) => json(api.settings.$put({ json: changes }));

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

export const searchWikipedia = (q: string, kind: 'manga' | 'comics') =>
    json(api.metadata.wikipedia.search.$get({ query: { q, kind } }));

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

export const stopPreview = () => json(api.preview.$delete());

export const setSeriesStatus = (
    seriesId: number,
    status: 'ongoing' | 'completed' | null,
) => json(api.series[':id'].status.$put({ ...id(seriesId), json: { status } }));

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
export const markSeriesRead = (seriesId: number, read: boolean) =>
    json(api.series[':id'].read.$put({ ...id(seriesId), json: { read } }));

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

/** Format d'une série ou d'un dossier de brouillons (null : par défaut). */
export type ClassificationChanges = {
    format?: Format | null;
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
