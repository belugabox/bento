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
