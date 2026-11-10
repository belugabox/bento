import { articleFirst } from '../library/sortName';
import { type VolumeKind, kindOfWord } from '../library/volumeKind';

/**
 * Numéro de tome et année lus dans un nom de fichier, par ex.
 * « Spy X Family T05 (Endo) (2021) [Digital-1920] » ou « One Piece #12 (2014) ».
 */
export type VolumeFileName = {
    /** Nom de la série : ce qui précède le numéro de tome. */
    series?: string;
    number?: string;
    /** Hors-série ou spécial (« HS01 », « SP01 ») ; rien pour un tome. */
    kind?: VolumeKind;
    year?: number;
};

// « T05 », « T.5 », « Tome 5 », « Vol 5 », « Volume 05 », « #05 ».
const NUMBER =
    /(?:^|[\s._\-[(])(?:t(?:ome)?|vol(?:ume)?)[\s.]*(\d{1,3}(?:\.\d+)?)(?=$|[\s._\-\])])|#(\d{1,3}(?:\.\d+)?)\b/i;
// Hors-série et spéciaux : « HS01 », « HS 1 », « Hors-série 1 », « SP01 »,
// « Spécial 2 ».
// Intégrales : « INT01 », « Intégrale 2 » (pas « Intégrale 10 tomes »).
const SPECIAL =
    /(?:^|[\s._\-[(])(hs|sp|int|int[ée]grale|hors[\s-]?s[ée]ries?|sp[ée]cial)[\s.\-]*(\d{1,3}(?:\.\d+)?)(?=$|[\s._\-\])])(?!\s*tomes?\b)/i;
// Année seule entre crochets ou parenthèses : « (2021) », « [2020] ».
// « [Digital-1920] » n'est pas une année.
const YEAR = /[[(]((?:19|20)\d{2})[\])]/;

export const parseVolumeFileName = (name: string): VolumeFileName => {
    const special = SPECIAL.exec(name);
    const number = special ?? NUMBER.exec(name);
    const year = YEAR.exec(name);
    const digits = special ? special[2] : (number?.[1] ?? number?.[2]);
    const series = number
        ? name
              .slice(0, number.index)
              .replace(/[\s._\-[(]+$/, '')
              .trim()
        : undefined;
    return {
        // « Boxer (The) » devient « The Boxer ».
        series: series ? articleFirst(series) : undefined,
        number: digits ? String(Number(digits)) : undefined,
        ...(special && { kind: kindOfWord(special[1]) }),
        year: year ? Number(year[1]) : undefined,
    };
};
