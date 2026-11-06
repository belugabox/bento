import { genreKey, splitList } from '@server/types';

// Suggestions montrées à la fois.
const LIMIT = 8;

/**
 * Noms qui complètent le dernier de la saisie (« Hiroya Oku, Ka » : « Kazuo
 * Koike »…), sans casse ni accents, sauf ceux déjà saisis. Chaque
 * suggestion reprend le début de la saisie.
 */
export const creditSuggestions = (names: string[], value: string) => {
    const at = value.lastIndexOf(',');
    const before = at >= 0 ? value.slice(0, at) : '';
    const typed = genreKey(value.slice(at + 1));
    if (!typed) return [];
    const prefix = at >= 0 ? `${before}, ` : '';
    const already = new Set(splitList(before).map(genreKey));
    return names
        .filter((name) => {
            const key = genreKey(name);
            return key.includes(typed) && key !== typed && !already.has(key);
        })
        .slice(0, LIMIT)
        .map((name) => `${prefix}${name}`);
};
