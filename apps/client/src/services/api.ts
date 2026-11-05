import { hc } from 'hono/client';

import type { ApiType } from '@server/types';

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
export const coverUrl = (volumeId: number) => `/api/volumes/${volumeId}/cover`;
export const pageUrl = (volumeId: number, index: number) =>
    `/api/volumes/${volumeId}/pages/${index}`;

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

export const fetchInProgress = () => json(api.continue.$get());

export type InProgressVolume = Awaited<
    ReturnType<typeof fetchInProgress>
>[number];

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

export type CoverSource =
    | { type: 'volume'; volumeId: number; page?: number }
    | { type: 'url'; url: string }
    | { type: 'default' };

export const setSeriesCover = (seriesId: number, source: CoverSource) =>
    json(api.series[':id'].cover.$put({ ...id(seriesId), json: source }));

/** Couverture d'une série ; l'adresse change avec la couverture choisie. */
export const seriesCoverUrl = (series: {
    id: number;
    coverUpdatedAt: string | null;
    coverVolumeId?: number | null;
}) =>
    `/api/series/${series.id}/cover?v=${encodeURIComponent(series.coverUpdatedAt ?? String(series.coverVolumeId ?? ''))}`;

/** Séries en attente dans les brouillons (pastille de l'en-tête). */
export const fetchPendingDrafts = () => json(api.drafts.pending.$get());

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
