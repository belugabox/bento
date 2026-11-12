// Sans dépendance à Node : partagé avec le client (via `@server/types`).
import { genreKey } from '../classification';
import { articleFirst } from '../library/sortName';

/**
 * Clé pour reconnaître une série d'un site à l'autre : sans majuscules,
 * accents ni ponctuation, l'article remis devant (« Sculpteur (Le) »), et
 * « et », « & » ou « and » ignorés (« Gloutons & Dragons » = « Gloutons et
 * Dragons »).
 */
export const seriesNameKey = (name: string) =>
    genreKey(articleFirst(name.trim()))
        .split(' ')
        .filter((word) => word && word !== 'et' && word !== 'and')
        .join(' ');

/** Même série, à l'écriture près. */
export const sameSeriesName = (a: string, b: string) =>
    seriesNameKey(a) === seriesNameKey(b);

/**
 * Autre écriture d'un nom à chercher, si le site ne trouve pas la première :
 * « & » pour « et », et l'inverse ; undefined sans « et » ni « & ».
 */
export const nameVariant = (name: string) => {
    if (/\s&\s/.test(name)) return name.replace(/\s&\s/g, ' et ');
    if (/\set\s/i.test(name)) return name.replace(/\set\s/gi, ' & ');
    return undefined;
};
