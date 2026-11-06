// Sans dépendance à Node : partagé avec le client (via `@server/types`).
import type { ComicInfo } from '../archive/comicInfo';
import { KIND_PREFIXES, volumeNumbering } from './volumeKind';

/**
 * Nom de série utilisable comme nom de dossier : pas de séparateur, ni de
 * caractère refusé par Windows (la bibliothèque peut être partagée en SMB).
 */
const folderName = (series: string) =>
    series
        .replace(/\s*:\s+/g, ' - ')
        .replace(/"/g, "'")
        .replace(/[?*]/g, '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\\/:<>|\x00-\x1f]/g, '-')
        .trim()
        // Windows refuse les noms finissant par un point ou une espace.
        .replace(/[. ]+$/, '');

/**
 * Emplacement d'un tome dans la bibliothèque, d'après son ComicInfo :
 * `Série/Série #NN (Année).cbz`, ou `Série HSNN` pour un hors-série et
 * `Série SPNN` pour un spécial (année facultative). `undefined` sans série
 * ou sans numéro.
 */
export const publicationPathOf = (
    comicInfo: Pick<ComicInfo, 'Series' | 'Number' | 'Year' | 'Format'>,
): string | undefined => {
    const series = comicInfo.Series ? folderName(comicInfo.Series) : '';
    const { kind, number } = volumeNumbering(comicInfo);
    if (!series || !number) return undefined;
    const padded = number.replace(/^\d+/, (digits) => digits.padStart(2, '0'));
    const label =
        kind === 'volume' ? `#${padded}` : `${KIND_PREFIXES[kind]}${padded}`;
    const year = comicInfo.Year ? ` (${comicInfo.Year})` : '';
    return `${series}/${series} ${label}${year}.cbz`;
};

/**
 * Numéro d'un tome rangé, d'après son nom `Série #NN (Année)` : « 12 »,
 * ou « HS1 » et « SP1 » pour un hors-série et un spécial (chaque type a sa
 * numérotation).
 */
export const volumeNumberOf = (fileName: string): string | undefined => {
    const found = /(#|\b(?:HS|SP))(\d+(?:\.\d+)?)(?!\d|\.\d)/i.exec(fileName);
    if (!found) return undefined;
    const prefix = found[1] === '#' ? '' : found[1]!.toUpperCase();
    return `${prefix}${Number(found[2])}`;
};
