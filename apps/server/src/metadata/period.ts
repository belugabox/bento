// Sans dépendance à Node : partagé avec le client (via `@server/types`).

/** Parution d'une série (édition d'origine) : début, et fin si finie. */
export type Period = { start: number | null; end: number | null };

const YEAR = /\b(1[89]\d{2}|20\d{2})\b/g;

/**
 * Période lue dans un texte : « 2000 », « 2000 – 2013 », « 2000-2013 » ;
 * vide : aucune ; null si le texte n'est pas une période (deux années au
 * plus, la fin après le début).
 */
export const parsePeriod = (text: string): Period | null => {
    const trimmed = text.trim();
    if (!trimmed) return { start: null, end: null };
    if (!/^[\d\s\-–—à]+$/.test(trimmed)) return null;
    const years = [...trimmed.matchAll(YEAR)].map((m) => Number(m[1]));
    const [start, end, more] = years;
    if (start === undefined || more !== undefined) return null;
    if (end !== undefined && end < start) return null;
    return { start, end: end ?? null };
};

/** « 2000 – 2013 », « 2000 », ou vide. */
export const periodText = ({ start, end }: Period) =>
    start === null
        ? ''
        : end && end !== start
          ? `${start} – ${end}`
          : `${start}`;
