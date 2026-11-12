import type { SourceLink } from '../metadata/sourceLink';

// Au-delà, une numérotation étrange (année, ISBN…) : rien de signalé.
const MAX_VOLUMES = 500;

/** Nombre de tomes parus d'après une fiche liée. */
export type PublishedCount = {
    site: 'manga-news' | 'bedetheque';
    count: number;
};

/** Tomes parus d'après chaque fiche liée qui le dit (Manga-news, Bedetheque). */
export const publishedCounts = (
    links: SourceLink[],
    sheets: Map<string, { volumeCount: number | null }>,
): PublishedCount[] =>
    (['manga-news', 'bedetheque'] as const).flatMap((site) => {
        const link = links.find((l) => l.site === site);
        const count = link && sheets.get(`${site}:${link.id}`)?.volumeCount;
        return count ? [{ site, count }] : [];
    });

/**
 * Tomes parus (la fiche retenue, et les autres si elles disent autre chose)
 * et numéros absents de Bento.
 */
export type VolumesStatus = {
    published: PublishedCount | null;
    others: PublishedCount[];
    missing: number[];
};

/**
 * Tomes manquants : les numéros de 1 au dernier tome paru (ou au plus grand
 * présent) absents de Bento. Rien à signaler sans tome numéroté (one-shot),
 * ni pour une série qui a des intégrales (elles couvrent plusieurs tomes).
 *
 * Quand les fiches ne disent pas le même nombre (une autre édition : Gantz
 * en Perfect sur Bedetheque, l'édition normale sur Manga-news), celle qui
 * est la plus proche des tomes de Bento est retenue. Manga-news compte dans
 * la série ses hors-séries et spéciaux (Death Note : « How to Read », le
 * 13e) : ceux de Bento en sont retirés ; Bedetheque les compte à part.
 */
export const volumesStatus = (
    volumes: { kind: string; number: string | null }[],
    counts: PublishedCount[],
): VolumesStatus => {
    const numbers = new Set(
        volumes
            .filter((v) => v.kind === 'volume')
            .map((v) => Number(v.number))
            .filter((n) => Number.isInteger(n) && n > 0),
    );
    const extras = volumes.filter(
        (v) => v.kind === 'hors-serie' || v.kind === 'special',
    ).length;
    // Tomes de la série d'après une fiche, sans ce qu'elle compte en plus.
    const mainCount = ({ site, count }: PublishedCount) =>
        site === 'manga-news' ? Math.max(count - extras, 0) : count;
    const published =
        [...counts].sort(
            (a, b) =>
                Math.abs(mainCount(a) - numbers.size) -
                Math.abs(mainCount(b) - numbers.size),
        )[0] ?? null;
    const others = counts.filter(
        (c) => published && c.count !== published.count,
    );
    const withIntegrales = volumes.some((v) => v.kind === 'integrale');
    if (numbers.size === 0 || withIntegrales) {
        return { published, others, missing: [] };
    }
    const last = Math.max(published ? mainCount(published) : 0, ...numbers);
    if (last > MAX_VOLUMES) return { published, others, missing: [] };
    const missing: number[] = [];
    for (let n = 1; n <= last; n++) if (!numbers.has(n)) missing.push(n);
    return { published, others, missing };
};
