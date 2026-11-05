// Sans dépendance à Node : partagé avec le client (via `@server/types`).
import type { ComicInfo } from '../archive/comicInfo';

/** Nom de série utilisable comme nom de dossier (pas de séparateur). */
const folderName = (series: string) =>
    series
        .replace(/[\\/]/g, '-')
        .trim()
        // Windows refuse les noms finissant par un point ou une espace.
        .replace(/[. ]+$/, '');

/**
 * Emplacement d'un tome dans la bibliothèque, d'après son ComicInfo :
 * `Série/Série #NN (Année).cbz` (année facultative). `undefined` sans
 * série ou sans numéro.
 */
export const publicationPathOf = (
    comicInfo: Pick<ComicInfo, 'Series' | 'Number' | 'Year'>,
): string | undefined => {
    const series = comicInfo.Series ? folderName(comicInfo.Series) : '';
    const number = comicInfo.Number?.trim();
    if (!series || !number) return undefined;
    const padded = number.replace(/^\d+/, (digits) => digits.padStart(2, '0'));
    const year = comicInfo.Year ? ` (${comicInfo.Year})` : '';
    return `${series}/${series} #${padded}${year}.cbz`;
};

/** Numéro d'un tome rangé, d'après son nom `Série #NN (Année)`. */
export const volumeNumberOf = (fileName: string): string | undefined => {
    const digits = /#(\d+(?:\.\d+)?)(?!\d|\.\d)/.exec(fileName)?.[1];
    return digits ? String(Number(digits)) : undefined;
};
