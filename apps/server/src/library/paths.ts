import path from 'node:path';

import type { ComicInfo } from '../archive/comicInfo';
import { badRequest } from '../tools/errors';

/** Dossier des tomes à préparer, dans chaque bibliothèque. */
export const DRAFT_FOLDER = '_draft';

/**
 * Chemin absolu d'un fichier de la bibliothèque, à partir de son chemin
 * relatif (séparé par « / »). Refuse tout chemin qui sort de la
 * bibliothèque : les chemins viennent du client, ou du ComicInfo d'une
 * archive (champ `Series`), deux sources non fiables.
 */
export const resolveInLibrary = (libraryPath: string, relative: string) => {
    const base = path.resolve(libraryPath);
    const target = path.resolve(base, ...relative.split('/'));
    if (target === base || !target.startsWith(base + path.sep)) {
        throw badRequest(`Chemin hors de la bibliothèque : « ${relative} »`);
    }
    return target;
};

/** Chemin relatif (séparé par « / ») d'un fichier de la bibliothèque. */
export const relativeTo = (libraryPath: string, fullPath: string) =>
    path
        .relative(path.resolve(libraryPath), fullPath)
        .split(path.sep)
        .join('/');

export const isDraft = (relative: string) =>
    relative.split('/')[0] === DRAFT_FOLDER;

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
