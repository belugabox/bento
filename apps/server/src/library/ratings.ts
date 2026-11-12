import type { Db } from '../db';
import { sourceRatings } from '../db/schema';
import type {
    MetadataSource,
    SeriesRating,
    SourceLink,
} from '../metadata/sourceLink';

/** Note d'une fiche, dans le détail d'une série. */
export type SourceRatingDetail = SeriesRating & { site: MetadataSource };

/** Note d'une série : la moyenne de ses fiches, et le détail par site. */
export type SeriesRatingSummary = SeriesRating & {
    sources: SourceRatingDetail[];
};

/**
 * Garde la note d'une fiche lue sur son site (la remplace si elle existe) ;
 * sans note, rien.
 */
export const saveSourceRating = (
    db: Db,
    site: MetadataSource,
    sourceId: string,
    rating: SeriesRating | undefined,
) => {
    if (!rating) return;
    const values = {
        value: rating.value,
        count: rating.count,
        updatedAt: new Date(),
    };
    db.insert(sourceRatings)
        .values({ site, sourceId, ...values })
        .onConflictDoUpdate({
            target: [sourceRatings.site, sourceRatings.sourceId],
            set: values,
        })
        .run();
};

/** Toutes les notes gardées, par fiche (« manga-news:Gantz »). */
export const sourceRatingsMap = (db: Db) =>
    new Map(
        db
            .select()
            .from(sourceRatings)
            .all()
            .map((row) => [
                `${row.site}:${row.sourceId}`,
                { value: row.value, count: row.count },
            ]),
    );

/**
 * Note d'une série d'après ses fiches : la moyenne de tous les avis (chaque
 * site pèse selon son nombre d'avis), et le détail par site ; null sans
 * aucune note.
 */
export const seriesRatingOf = (
    links: SourceLink[],
    ratings: Map<string, SeriesRating>,
): SeriesRatingSummary | null => {
    const sources = links.flatMap((link) => {
        const rating = ratings.get(`${link.site}:${link.id}`);
        return rating ? [{ site: link.site, ...rating }] : [];
    });
    const count = sources.reduce((total, s) => total + s.count, 0);
    if (count === 0) return null;
    const sum = sources.reduce((total, s) => total + s.value * s.count, 0);
    return { value: Math.round((sum / count) * 10) / 10, count, sources };
};
