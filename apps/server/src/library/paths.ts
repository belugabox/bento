import path from 'node:path';

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

/**
 * Groupe d'un brouillon (une future série) : son dossier, ou le fichier
 * lui-même s'il est à la racine de _draft, où chaque tome est isolé. Un
 * .cbr y est nommé comme le .cbz qu'il deviendra : ses réglages le suivent
 * après la conversion.
 */
export const draftGroupOf = (relative: string) => {
    const folder = path.posix.dirname(relative);
    return folder === DRAFT_FOLDER
        ? relative.replace(/\.cbr$/i, '.cbz')
        : folder;
};

export { publicationPathOf, volumeNumberOf } from './publication';
