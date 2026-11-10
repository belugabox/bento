// Sans dépendance à Node : partagé avec le client (via `@server/types`).
import { genreKey } from '../classification';

/**
 * Type d'un tome : un tome de la série, un one-shot (histoire complète en un
 * tome), une intégrale (plusieurs tomes d'origine réunis), un hors-série ou
 * un spécial. Chaque type a sa propre numérotation. Tomes, one-shots et
 * intégrales forment la série (comptés, lus) ; hors-séries et spéciaux
 * viennent après, à part (ordre de lecture, tomes manquants).
 */
export const VOLUME_KINDS = [
    'volume',
    'one-shot',
    'integrale',
    'hors-serie',
    'special',
] as const;
export type VolumeKind = (typeof VOLUME_KINDS)[number];

/** Types qui forment la série elle-même (comptés : « 12 tomes », « lue »). */
export const MAIN_KINDS: readonly VolumeKind[] = [
    'volume',
    'one-shot',
    'integrale',
];
export const isMainKind = (kind: VolumeKind | undefined) =>
    MAIN_KINDS.includes(kind ?? 'volume');

export const VOLUME_KIND_LABELS: Record<VolumeKind, string> = {
    volume: 'Tome',
    'one-shot': 'One-shot',
    integrale: 'Intégrale',
    'hors-serie': 'Hors-série',
    special: 'Spécial',
};

/** Valeur du champ `Format` du ComicInfo, qui garde le type (rien : tome). */
export const KIND_FORMATS: Record<Exclude<VolumeKind, 'volume'>, string> = {
    'one-shot': 'One-shot',
    integrale: 'Intégrale',
    'hors-serie': 'Hors-série',
    special: 'Spécial',
};

/**
 * Préfixe du numéro dans les noms de fichiers : « Gantz HS01.cbz ». Un
 * one-shot n'a pas de numéro : « Spirale (2021).cbz ».
 */
export const KIND_PREFIXES: Record<
    Exclude<VolumeKind, 'volume' | 'one-shot'>,
    string
> = {
    integrale: 'INT',
    'hors-serie': 'HS',
    special: 'SP',
};

/**
 * Tome seul, sans numéro : un one-shot, ou une intégrale non numérotée
 * (traitée comme un one-shot : « Intégrale », « Lire », fichier sans
 * numéro).
 */
export const isStandalone = (volume: {
    kind?: VolumeKind;
    number?: string | null;
}) =>
    volume.kind === 'one-shot' ||
    (volume.kind === 'integrale' && !volume.number?.trim());

/**
 * Titre par défaut d'un tome : « Tome 3 », « Intégrale 1 », « One-shot »
 * (sans numéro).
 */
export const kindTitle = (kind: VolumeKind, number?: string | null) =>
    kind === 'one-shot' || !number
        ? VOLUME_KIND_LABELS[kind]
        : `${VOLUME_KIND_LABELS[kind]} ${number}`;

/** Type désigné par un mot : « HS », « Hors-série », « SP », « Special »… */
export const kindOfWord = (
    word: string | undefined,
): VolumeKind | undefined => {
    const key = genreKey(word ?? '').replace(/\s+/g, '');
    if (['hs', 'horsserie', 'horsseries'].includes(key)) return 'hors-serie';
    if (['sp', 'special', 'speciaux', 'specials'].includes(key)) {
        return 'special';
    }
    if (['oneshot', 'oneshots', 'os'].includes(key)) return 'one-shot';
    if (['int', 'integrale', 'integrales', 'omnibus'].includes(key)) {
        return 'integrale';
    }
    return undefined;
};

// Numéro préfixé, gardé tel quel dans le ComicInfo : « HS01 », « SP 2 ».
const PREFIXED = /^(hs|sp|int)\s*[-.]?\s*(\d{1,4}(?:\.\d+)?)$/i;

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

/**
 * Ordre des types : la série (tomes, one-shots, intégrales), puis les
 * hors-séries, puis les spéciaux.
 */
export const kindRank = (kind: VolumeKind) => VOLUME_KINDS.indexOf(kind);
