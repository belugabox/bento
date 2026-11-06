// Sans dépendance à Node : partagé avec le client (via `@server/types`).
import { genreKey } from '../classification';

/**
 * Type d'un tome : un tome de la série, un hors-série ou un spécial. Chaque
 * type a sa propre numérotation ; hors-séries et spéciaux viennent après
 * les tomes, à part (ordre de lecture, tomes manquants).
 */
export const VOLUME_KINDS = ['volume', 'hors-serie', 'special'] as const;
export type VolumeKind = (typeof VOLUME_KINDS)[number];

export const VOLUME_KIND_LABELS: Record<VolumeKind, string> = {
    volume: 'Tome',
    'hors-serie': 'Hors-série',
    special: 'Spécial',
};

/** Valeur du champ `Format` du ComicInfo, qui garde le type (rien : tome). */
export const KIND_FORMATS: Record<Exclude<VolumeKind, 'volume'>, string> = {
    'hors-serie': 'Hors-série',
    special: 'Spécial',
};

/** Préfixe du numéro dans les noms de fichiers : « Gantz HS01.cbz ». */
export const KIND_PREFIXES: Record<Exclude<VolumeKind, 'volume'>, string> = {
    'hors-serie': 'HS',
    special: 'SP',
};

/** Type désigné par un mot : « HS », « Hors-série », « SP », « Special »… */
export const kindOfWord = (
    word: string | undefined,
): VolumeKind | undefined => {
    const key = genreKey(word ?? '').replace(/\s+/g, '');
    if (['hs', 'horsserie', 'horsseries'].includes(key)) return 'hors-serie';
    if (['sp', 'special', 'speciaux', 'specials'].includes(key)) {
        return 'special';
    }
    return undefined;
};

// Numéro préfixé, gardé tel quel dans le ComicInfo : « HS01 », « SP 2 ».
const PREFIXED = /^(hs|sp)\s*[-.]?\s*(\d{1,4}(?:\.\d+)?)$/i;

/**
 * Type et numéro d'un tome : d'après le champ `Format` du ComicInfo, sinon
 * un numéro préfixé (« HS01 »), sinon le nom du fichier (« Gantz HS01 »). Le numéro rendu
 * est sans préfixe ni zéros (« HS01 » : hors-série 1).
 */
export const volumeNumbering = (
    info: { Format?: string; Number?: string },
    fromName: { kind?: VolumeKind; number?: string } = {},
): { kind: VolumeKind; number?: string } => {
    const raw = info.Number?.trim();
    const prefixed = raw ? PREFIXED.exec(raw) : null;
    const kind =
        kindOfWord(info.Format) ??
        (prefixed ? kindOfWord(prefixed[1]) : undefined) ??
        fromName.kind ??
        'volume';
    const number = prefixed
        ? String(Number(prefixed[2]))
        : (raw ?? fromName.number);
    return { kind, number: number || undefined };
};

/** Ordre des types : les tomes, puis les hors-séries, puis les spéciaux. */
export const kindRank = (kind: VolumeKind) => VOLUME_KINDS.indexOf(kind);
