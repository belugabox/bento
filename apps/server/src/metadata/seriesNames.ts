// Sans dépendance à Node : partagé avec le client (via `@server/types`).
import { genreKey } from '../classification';
import { articleFirst } from '../library/sortName';

/**
 * Clé pour reconnaître une série d'un site à l'autre : sans majuscules,
 * accents ni ponctuation, l'article remis devant (« Sculpteur (Le) »), et
 * « et », « & » ou « and » ignorés (« Gloutons & Dragons » = « Gloutons et
 * Dragons »), « × » lu « x » (« Spy × Family » = « Spy X Family »).
 */
export const seriesNameKey = (name: string) =>
    genreKey(articleFirst(name.trim()).replace(/×/g, ' x '))
        .split(' ')
        .filter((word) => word && word !== 'et' && word !== 'and')
        .join(' ');

/** Même série, à l'écriture près. */
export const sameSeriesName = (a: string, b: string) =>
    seriesNameKey(a) === seriesNameKey(b);

/**
 * Autre écriture d'un nom à chercher, si le site ne trouve pas la première :
 * sans points (« Dr. Stone », « Last.Hero.Inuyashiki » : Wikipédia les
 * ignore, pas Manga-news ni Bedetheque), et « & » pour « et », et l'inverse ;
 * undefined si rien ne change.
 */
export const nameVariant = (name: string) => {
    let variant = name.replace(/\.+/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\s&\s/.test(variant)) variant = variant.replace(/\s&\s/g, ' et ');
    else if (/\set\s/i.test(variant)) {
        variant = variant.replace(/\set\s/gi, ' & ');
    }
    return variant === name.trim() ? undefined : variant;
};
