/** Tome de la série, tel que le lecteur le montre dans la barre. */
export type SeriesVolume = {
    id: number;
    pageCount: number;
    /** Progression de la personne ; null : pas commencé. */
    progress: { page: number; completed: boolean } | null;
};

/** Au-delà, des segments seraient trop fins : une barre continue. */
export const MAX_SEGMENTS = 40;

/**
 * Part lue d'un tome, de 0 à 1 : lu, 1 ; commencé, jusqu'à sa page. Le tome
 * ouvert suit la page affichée (un tome relu reste lu).
 */
export const volumeShare = (
    volume: SeriesVolume,
    current?: { id: number; page: number },
) => {
    if (volume.progress?.completed) return 1;
    const page =
        current?.id === volume.id
            ? Math.max(current.page, volume.progress?.page ?? -1)
            : (volume.progress?.page ?? -1);
    return volume.pageCount ? Math.min(1, (page + 1) / volume.pageCount) : 0;
};

/** Part lue de la série, en pages, de 0 à 100 (arrondie vers le bas). */
export const seriesPercent = (
    volumes: SeriesVolume[],
    current?: { id: number; page: number },
) => {
    const total = volumes.reduce((sum, v) => sum + v.pageCount, 0);
    if (!total) return 0;
    const read = volumes.reduce(
        (sum, v) => sum + volumeShare(v, current) * v.pageCount,
        0,
    );
    return Math.floor((read * 100) / total);
};
