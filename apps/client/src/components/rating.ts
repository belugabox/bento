import type { MetadataSource } from '@server/types';

/** Note d'une fiche en ligne, sur 5, et son nombre d'avis. */
export type SiteRating = { site: MetadataSource; value: number; count: number };

/** Note d'une série : la moyenne de ses fiches, et le détail par site. */
export type RatingSummary = {
    value: number;
    count: number;
    sources: SiteRating[];
};

/**
 * Moyenne de tous les avis, chaque site selon son nombre d'avis (comme le
 * serveur) ; null sans aucun avis.
 */
export const averageRating = (sources: SiteRating[]): RatingSummary | null => {
    const count = sources.reduce((total, s) => total + s.count, 0);
    if (count === 0) return null;
    const sum = sources.reduce((total, s) => total + s.value * s.count, 0);
    return { value: Math.round((sum / count) * 10) / 10, count, sources };
};
