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

/** Noms déjà connus, par rôle : personnes (scénario, dessin) et éditeurs. */
export type KnownNames = { people: string[]; publishers: string[] };

// Mot tout en capitales, d'au moins deux lettres (« OKU », pas « J. »).
const isCapitals = (word: string) =>
    /\p{L}{2}/u.test(word) && word === word.toLocaleUpperCase('fr');

/** « MÉZIÈRES » : « Mézières », « D'ARC » : « D'Arc ». */
const capitalized = (word: string) =>
    word
        .toLocaleLowerCase('fr')
        .replace(
            /(^|[-'’])(\p{L})/gu,
            (_, before: string, letter: string) =>
                before + letter.toLocaleUpperCase('fr'),
        );

/**
 * Nom de famille en capitales remis en casse normale (Manga-news écrit
 * « Hiroya OKU »). Un nom tout en capitales est gardé : « CLAMP », « ONE ».
 */
export const fixCase = (name: string) => {
    const words = name.trim().split(/\s+/);
    if (words.every(isCapitals)) return words.join(' ');
    return words
        .map((word) => (isCapitals(word) ? capitalized(word) : word))
        .join(' ');
};

// Mêmes mots, dans n'importe quel ordre (« Oku Hiroya », « Hiroya Oku »).
const wordsKey = (name: string) => genreKey(name).split(' ').sort().join(' ');

/**
 * Noms d'une fiche en ligne (« A, B ») nettoyés : l'écriture d'un nom déjà
 * connu de la bibliothèque (sans casse ni accents, prénom et nom dans
 * n'importe quel ordre), sinon le nom remis en casse normale ; chacun une
 * seule fois.
 */
export const cleanNames = (value: string | undefined, known: string[]) =>
    splitList(value)
        .map((name) => {
            const key = genreKey(name);
            const same =
                known.find((k) => genreKey(k) === key) ??
                known.find((k) => wordsKey(k) === wordsKey(name));
            return same ?? fixCase(name);
        })
        // Un nom en double (« Hiroya OKU, Oku Hiroya ») : une seule fois.
        .filter((name, index, names) => names.indexOf(name) === index)
        .join(', ');
