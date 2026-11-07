import {
    VOLUME_KINDS,
    VOLUME_KIND_LABELS,
    type VolumeKind,
} from '@server/types';

type Progress = { page: number; completed: boolean } | null;

export type VolumeWithProgress = {
    id: number;
    number: string | null;
    title: string | null;
    pageCount: number;
    progress: Progress;
};

/**
 * « Tome 12 », « Hors-série 1 », « Spécial 2 » ; sans numéro, le titre, ou
 * « Spécial » pour un spécial et « Hors-série » sinon.
 */
export const volumeLabel = (volume: {
    number: string | null;
    title: string | null;
    kind?: VolumeKind;
}) =>
    volume.number
        ? `${VOLUME_KIND_LABELS[volume.kind ?? 'volume']} ${volume.number}`
        : (volume.title ??
          (volume.kind === 'special' ? 'Spécial' : 'Hors-série'));

/** Libellé court, pour une carte étroite : « T2 », « HS1 », « SP2 ». */
export const volumeShortLabel = (volume: {
    number: string | null;
    title: string | null;
    kind?: VolumeKind;
}) =>
    volume.number
        ? `${SHORT_PREFIXES[volume.kind ?? 'volume']}${volume.number}`
        : volumeLabel(volume);

const SHORT_PREFIXES: Record<VolumeKind, string> = {
    volume: 'T',
    'hors-serie': 'HS',
    special: 'SP',
};

const KIND_COUNTS: Record<VolumeKind, [string, string]> = {
    volume: ['tome', 'tomes'],
    'hors-serie': ['hors-série', 'hors-séries'],
    special: ['spécial', 'spéciaux'],
};

/**
 * Tomes comptés (« 3 lus » sur 12) : sans hors-séries ni spéciaux, sauf
 * pour une série qui n'a que ceux-là (comme `countedVolume` du serveur).
 */
export const countedVolumes = <T extends { kind?: VolumeKind }>(
    volumes: T[],
) => {
    const regular = volumes.filter((v) => (v.kind ?? 'volume') === 'volume');
    return regular.length > 0 ? regular : volumes;
};

/** « 12 tomes · 1 spécial » : chaque type compté à part. */
export const volumeCountLabel = (volumes: { kind?: VolumeKind }[]) =>
    VOLUME_KINDS.flatMap((kind) => {
        const count = volumes.filter(
            (v) => (v.kind ?? 'volume') === kind,
        ).length;
        return count
            ? [`${count} ${KIND_COUNTS[kind][count > 1 ? 1 : 0]}`]
            : [];
    }).join(' · ') || '0 tome';

/**
 * Titre propre d'un tome, à afficher sous son libellé ; null s'il n'en a
 * pas, ou s'il répète le libellé (« Tome 3 », « Hors-série 1 », rempli
 * d'après le numéro).
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
    const repeated = new RegExp(
        `^(tome|vol(ume)?\\.?|hors[- ]s[ée]rie|hs|sp[ée]cial|sp)\\s*0*${number}$`,
        'i',
    );
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
