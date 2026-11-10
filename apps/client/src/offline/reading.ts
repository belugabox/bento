import { fetchPageSizes, fetchVolume } from '@/services/api';
import { NetworkError } from '@/services/network';

import { getDownload, progressOf } from './downloads';

/** Tome non téléchargé, sans réseau. */
const notDownloaded = () =>
    new Error('Ce tome n’est pas téléchargé : il faut du réseau pour le lire.');

/**
 * Tome à lire : demandé au serveur ; sans réseau, sa fiche téléchargée (avec
 * la lecture faite sur l'appareil).
 */
export const loadVolume = async (volumeId: number) => {
    try {
        return await fetchVolume(volumeId);
    } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        const meta = await getDownload(volumeId);
        if (!meta) throw notDownloaded();
        return { ...meta, progress: progressOf(meta) };
    }
};

/** Tailles des pages : du serveur, sinon celles du tome téléchargé. */
export const loadPageSizes = async (volumeId: number) => {
    try {
        return await fetchPageSizes(volumeId);
    } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        const meta = await getDownload(volumeId);
        if (!meta) throw notDownloaded();
        return meta.pageSizes;
    }
};
