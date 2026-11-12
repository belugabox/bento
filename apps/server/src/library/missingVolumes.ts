import type { SourceLink } from '../metadata/sourceLink';

// Au-delà, une numérotation étrange (année, ISBN…) : rien de signalé.
const MAX_VOLUMES = 500;

/**
 * Tomes parus d'après les fiches de la série : Manga-news (édition
 * française) d'abord, sinon Bedetheque ; null sans fiche qui le dise.
 */
export const publishedCount = (
    links: SourceLink[],
    sheets: Map<string, { volumeCount: number | null }>,
): number | null => {
    for (const site of ['manga-news', 'bedetheque'] as const) {
        const link = links.find((l) => l.site === site);
        const count = link && sheets.get(`${site}:${link.id}`)?.volumeCount;
        if (count) return count;
    }
    return null;
};

/** Tomes parus (d'après les fiches) et numéros absents de Bento. */
export type VolumesStatus = { published: number | null; missing: number[] };

/**
 * Tomes manquants : les numéros de 1 au dernier tome paru (ou au plus grand
 * présent) absents de Bento. Rien à signaler sans tome numéroté (one-shot),
 * ni pour une série qui a des intégrales (elles couvrent plusieurs tomes).
 */
export const volumesStatus = (
    volumes: { kind: string; number: string | null }[],
    published: number | null,
): VolumesStatus => {
    const numbers = new Set(
        volumes
            .filter((v) => v.kind === 'volume')
            .map((v) => Number(v.number))
            .filter((n) => Number.isInteger(n) && n > 0),
    );
    const withIntegrales = volumes.some((v) => v.kind === 'integrale');
    if (numbers.size === 0 || withIntegrales) return { published, missing: [] };
    const last = Math.max(published ?? 0, ...numbers);
    if (last > MAX_VOLUMES) return { published, missing: [] };
    const missing: number[] = [];
    for (let n = 1; n <= last; n++) if (!numbers.has(n)) missing.push(n);
    return { published, missing };
};
