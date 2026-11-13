import {
    VOLUME_KINDS,
    VOLUME_KIND_LABELS,
    type VolumeKind,
    isMainKind,
    isStandalone,
    kindTitle,
} from '@server/types';

type Progress = { page: number; completed: boolean } | null;

export type VolumeWithProgress = {
    id: number;
    number: string | null;
    title: string | null;
    pageCount: number;
    progress: Progress;
};

/** Groupement d'un tome (numéroté à part), ou rien. */
type WithGroup = { group?: string | null };

/**
 * « Tome 12 », « Intégrale 2 », « Hors-série 1 », « Spécial 2 », « One-shot »
 * (jamais de numéro) ; sans numéro, le titre, ou le nom du type. Dans un
 * groupement : « Part 1 - Rouge, Bleu et Jaune · Tome 1 ».
 */
export const volumeLabel = (
    volume: {
        number: string | null;
        title: string | null;
        kind?: VolumeKind;
    } & WithGroup,
) => {
    const kind = volume.kind ?? 'volume';
    // One-shot, intégrale sans numéro : le nom du type.
    const label = isStandalone(volume)
        ? VOLUME_KIND_LABELS[kind]
        : volume.number
          ? kindTitle(kind, volume.number)
          : (volume.title ??
            VOLUME_KIND_LABELS[kind === 'volume' ? 'hors-serie' : kind]);
    return volume.group ? `${volume.group} · ${label}` : label;
};

/**
 * Libellé court, pour une carte étroite : « T2 », « HS1 », « SP2 » (sans le
 * groupement, trop long pour elle).
 */
export const volumeShortLabel = (volume: {
    number: string | null;
    title: string | null;
    kind?: VolumeKind;
}) =>
    volume.number && !isStandalone(volume)
        ? `${SHORT_PREFIXES[volume.kind ?? 'volume']}${volume.number}`
        : volumeLabel({ ...volume, group: null });

const SHORT_PREFIXES: Record<VolumeKind, string> = {
    volume: 'T',
    'one-shot': 'One-shot',
    integrale: 'INT',
    'hors-serie': 'HS',
    special: 'SP',
};

const KIND_COUNTS: Record<VolumeKind, [string, string]> = {
    volume: ['tome', 'tomes'],
    'one-shot': ['one-shot', 'one-shots'],
    integrale: ['intégrale', 'intégrales'],
    'hors-serie': ['hors-série', 'hors-séries'],
    special: ['spécial', 'spéciaux'],
};

/**
 * Tomes comptés (« 3 lus » sur 12) : tomes, one-shots et intégrales, sans
 * hors-séries ni spéciaux, sauf pour une série qui n'a que ceux-là (comme
 * `countedVolume` du serveur).
 */
export const countedVolumes = <T extends { kind?: VolumeKind }>(
    volumes: T[],
) => {
    const regular = volumes.filter((v) => isMainKind(v.kind));
    return regular.length > 0 ? regular : volumes;
};

/**
 * « 12 tomes · 1 spécial » : chaque type compté à part ; « One-shot » pour
 * un one-shot seul.
 */
export const volumeCountLabel = (
    volumes: { kind?: VolumeKind; number?: string | null }[],
) =>
    volumes.length === 1 && isStandalone(volumes[0]!)
        ? VOLUME_KIND_LABELS[volumes[0]!.kind!]
        : VOLUME_KINDS.flatMap((kind) => {
              const count = volumes.filter(
                  (v) => (v.kind ?? 'volume') === kind,
              ).length;
              return count
                  ? [`${count} ${KIND_COUNTS[kind][count > 1 ? 1 : 0]}`]
                  : [];
          }).join(' · ') || '0 tome';

/**
 * Tomes d'une carte de série, d'après leur nombre et leurs types
 * (`volumeKinds` de la liste : « volume,integrale ») : « 12 tomes »,
 * « One-shot », « 2 intégrales ».
 */
export const seriesVolumesLabel = (count: number, kinds?: string | null) => {
    const list = (kinds ?? '').split(',').filter(Boolean) as VolumeKind[];
    const only = list.length === 1 ? list[0]! : 'volume';
    // Un one-shot, une intégrale : le nom du type seul.
    if ((only === 'one-shot' || only === 'integrale') && count === 1) {
        return VOLUME_KIND_LABELS[only];
    }
    const [one, many] = KIND_COUNTS[isMainKind(only) ? only : 'volume'];
    return `${count} ${count > 1 ? many : one}`;
};

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
    // « One-shot » : le libellé lui-même.
    if (/^one[- ]?shot$/i.test(title)) return null;
    // « 03 » comme « 3 » : les zéros initiaux sont facultatifs dans le titre.
    const number = volume.number
        .replace(/^0+(?=\d)/, '')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const repeated = new RegExp(
        `^(tome|vol(ume)?\\.?|int[ée]grale|int|hors[- ]s[ée]rie|hs|sp[ée]cial|sp)\\s*0*${number}$`,
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
