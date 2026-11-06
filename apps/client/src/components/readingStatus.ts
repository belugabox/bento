type Progress = { page: number; completed: boolean } | null;

export type VolumeWithProgress = {
    id: number;
    number: string | null;
    title: string | null;
    pageCount: number;
    progress: Progress;
};

/** « Tome 12 », ou le titre / « Hors-série » pour un tome sans numéro. */
export const volumeLabel = (volume: {
    number: string | null;
    title: string | null;
}) =>
    volume.number ? `Tome ${volume.number}` : (volume.title ?? 'Hors-série');

/**
 * Titre propre d'un tome, à afficher sous son libellé ; null s'il n'en a
 * pas, ou s'il répète le libellé (« Tome 3 », rempli d'après le numéro).
 */
export const volumeTitleOf = (volume: {
    number: string | null;
    title: string | null;
}) => {
    const title = volume.title?.trim();
    if (!title || !volume.number) return null;
    // « 03 » comme « 3 » : les zéros initiaux sont facultatifs dans le titre.
    const number = volume.number
        .replace(/^0+(?=\d)/, '')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const repeated = new RegExp(`^(tome|vol(ume)?\\.?)\\s*0*${number}$`, 'i');
    return repeated.test(title) ? null : title;
};

/** Avancement d'un tome (0 à 1) ; un tome lu est à 1. */
export const progressRatio = (volume: {
    pageCount: number;
    progress: Progress;
}) => {
    if (!volume.progress) return 0;
    if (volume.progress.completed) return 1;
    return volume.pageCount > 0
        ? (volume.progress.page + 1) / volume.pageCount
        : 0;
};

/**
 * Tome à proposer sur la fiche série : le premier pas encore lu (à
 * reprendre s'il est commencé), ou le premier à relire si tout est lu.
 */
export const nextToRead = <T extends VolumeWithProgress>(
    volumes: T[],
): { volume: T; action: 'start' | 'resume' | 'reread' } | undefined => {
    const unread = volumes.find((v) => !v.progress?.completed);
    if (unread) {
        return { volume: unread, action: unread.progress ? 'resume' : 'start' };
    }
    return volumes[0] && { volume: volumes[0], action: 'reread' };
};
