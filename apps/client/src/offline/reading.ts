import { fetchPageSizes, fetchVolume } from '@/services/api';
import { NetworkError } from '@/services/network';

import { getDownload, progressOf } from './downloads';

/**
 * Réponses chargées d'avance pour le tome suivant (en approchant de la fin
 * du tome lu) : servies une seule fois, et seulement fraîches (sinon la
 * reprise partirait d'une page périmée).
 */
export const PREFETCH_FRESH_MS = 5 * 60_000;
const prefetched = new Map<string, { at: number; value: Promise<unknown> }>();

const takePrefetched = <T>(key: string): Promise<T> | undefined => {
    const hit = prefetched.get(key);
    prefetched.delete(key);
    return hit && Date.now() - hit.at < PREFETCH_FRESH_MS
        ? (hit.value as Promise<T>)
        : undefined;
};

const prefetch = <T>(key: string, load: () => Promise<T>) => {
    const value = load();
    // Échec : rien de gardé, le lecteur redemandera normalement.
    value.catch(() => prefetched.delete(key));
    prefetched.set(key, { at: Date.now(), value });
    return value;
};

/** Oublie les réponses chargées d'avance (tests). */
export const clearPrefetched = () => prefetched.clear();

/** Tome non téléchargé, sans réseau. */
const notDownloaded = () =>
    new Error('Ce tome n’est pas téléchargé : il faut du réseau pour le lire.');

/**
 * Tome à lire : demandé au serveur ; sans réseau, sa fiche téléchargée (avec
 * la lecture faite sur l'appareil).
 */
export const loadVolume = async (volumeId: number) => {
    const ready = takePrefetched<Awaited<ReturnType<typeof fetchVolume>>>(
        `volume:${volumeId}`,
    );
    try {
        return await (ready?.catch(() => fetchVolume(volumeId)) ??
            fetchVolume(volumeId));
    } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        const meta = await getDownload(volumeId);
        if (!meta) throw notDownloaded();
        return { ...meta, progress: progressOf(meta) };
    }
};

/** Tailles des pages : du serveur, sinon celles du tome téléchargé. */
export const loadPageSizes = async (volumeId: number) => {
    const ready = takePrefetched<Awaited<ReturnType<typeof fetchPageSizes>>>(
        `sizes:${volumeId}`,
    );
    try {
        return await (ready?.catch(() => fetchPageSizes(volumeId)) ??
            fetchPageSizes(volumeId));
    } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        const meta = await getDownload(volumeId);
        if (!meta) throw notDownloaded();
        return meta.pageSizes;
    }
};

/**
 * Charge d'avance le tome suivant : sa fiche, les dimensions de ses pages
 * (double page, webtoon) et ses premières pages (cache du navigateur), pour
 * l'ouvrir sans attendre.
 */
export const prefetchVolume = async (
    volumeId: number,
    pageSrc: (volume: { id: number; version: number }, index: number) => string,
    pages = 3,
) => {
    if (prefetched.has(`volume:${volumeId}`)) return;
    prefetch(`sizes:${volumeId}`, () => fetchPageSizes(volumeId)).catch(
        () => {},
    );
    try {
        const volume = await prefetch(`volume:${volumeId}`, () =>
            fetchVolume(volumeId),
        );
        for (
            let index = 0;
            index < Math.min(pages, volume.pageCount);
            index++
        ) {
            new Image().src = pageSrc(volume, index);
        }
    } catch {
        // Pas de réseau ou refus : le tome se chargera à son ouverture.
    }
};
