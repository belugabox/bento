import { and, isNotNull, sql } from 'drizzle-orm';

import type { Db } from '../db';
import { series } from '../db/schema';
import { parseSources } from '../metadata/sourceLink';
import { seriesRatingOf, sourceRatingsMap } from './ratings';
import { type StatsOptions, periodStart } from './readingStats';
import { type Viewer, visibleTo } from './visibility';

// Requêtes en SQL brut, comme stats.ts (agrégats sur plusieurs tables).

const TOP = 10;
// Séries de chaque personne.
const TOP_PER_READER = 3;
// Bien notée : au moins 4 sur 5.
export const GOOD_RATING = 4;
// En dessous, une note dit peu (« 5 sur 5, 2 avis »).
export const MIN_REVIEWS = 10;

/**
 * Classements : séries les plus lues (en temps) sur la période, celles de
 * chaque personne, et les notes des sites face à la lecture de la famille
 * (les mieux notées, et les bien notées que personne n'a ouvertes).
 */
export const readingRankings = (db: Db, options: StatsOptions) => {
    const now = options.now ?? new Date();
    const start = periodStart(options.period, now);

    const bySeriesAndReader = db.all<{
        userId: number;
        userName: string;
        avatarSeed: string | null;
        seriesId: number;
        seriesName: string;
        seconds: number;
        pages: number;
    }>(sql`
        select u.id as userId, u.name as userName,
            u.avatar_seed as avatarSeed,
            s.id as seriesId, s.name as seriesName,
            sum(rs.ended_at - rs.started_at) / 1000 as seconds,
            sum(rs.pages) as pages
        from reading_sessions rs
        join users u on u.id = rs.user_id
        join volumes v on v.id = rs.volume_id
        join series s on s.id = v.series_id
        where rs.started_at >= ${start}
        group by u.id, s.id`);

    // Toute la famille, série par série.
    const series = new Map<
        number,
        {
            id: number;
            name: string;
            seconds: number;
            pages: number;
            readers: { id: number; name: string; avatarSeed: string | null }[];
        }
    >();
    for (const row of bySeriesAndReader) {
        const entry = series.get(row.seriesId) ?? {
            id: row.seriesId,
            name: row.seriesName,
            seconds: 0,
            pages: 0,
            readers: [],
        };
        entry.seconds += row.seconds;
        entry.pages += row.pages;
        entry.readers.push({
            id: row.userId,
            name: row.userName,
            avatarSeed: row.avatarSeed,
        });
        series.set(row.seriesId, entry);
    }
    const topSeries = [...series.values()]
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, TOP);

    // Chaque personne : ses séries les plus lues.
    const readers = new Map<
        number,
        {
            id: number;
            name: string;
            avatarSeed: string | null;
            seconds: number;
            series: { id: number; name: string; seconds: number }[];
        }
    >();
    for (const row of bySeriesAndReader) {
        const entry = readers.get(row.userId) ?? {
            id: row.userId,
            name: row.userName,
            avatarSeed: row.avatarSeed,
            seconds: 0,
            series: [],
        };
        entry.seconds += row.seconds;
        entry.series.push({
            id: row.seriesId,
            name: row.seriesName,
            seconds: row.seconds,
        });
        readers.set(row.userId, entry);
    }
    const perReader = [...readers.values()]
        .sort((a, b) => b.seconds - a.seconds)
        .map((reader) => ({
            ...reader,
            series: reader.series
                .sort((a, b) => b.seconds - a.seconds)
                .slice(0, TOP_PER_READER),
        }));

    // Notes des sites et lecture de la famille (depuis toujours).
    const ratings = sourceRatingsMap(db);
    const rated = db
        .all<{
            id: number;
            name: string;
            sources: string | null;
            readers: number;
            seconds: number;
        }>(
            sql`
        select s.id, s.name, s.source as sources,
            (select count(distinct rp.user_id) from volumes v
                cross join read_progress rp
                where v.series_id = s.id and rp.volume_id = v.id) as readers,
            coalesce((select sum(rs.ended_at - rs.started_at) / 1000
                from reading_sessions rs join volumes v on v.id = rs.volume_id
                where v.series_id = s.id), 0) as seconds
        from series s
        where s.source is not null`,
        )
        .flatMap(({ sources, ...row }) => {
            const rating = seriesRatingOf(parseSources(sources), ratings);
            return rating && rating.count >= MIN_REVIEWS
                ? [{ ...row, rating: rating.value, reviews: rating.count }]
                : [];
        })
        .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);

    return {
        topSeries,
        perReader,
        bestRated: rated.slice(0, TOP),
        // Bien notées, jamais ouvertes : de quoi donner des idées.
        unreadGems: rated
            .filter((s) => s.readers === 0 && s.rating >= GOOD_RATING)
            .slice(0, TOP),
    };
};

/**
 * « Bien notées, jamais ouvertes » (accueil) : séries visibles par la
 * personne, bien notées par les sites (assez d'avis), que personne de la
 * famille n'a ouvertes ; les mieux notées d'abord.
 */
export const neverOpenedGems = (db: Db, viewer: Viewer) => {
    const ratings = sourceRatingsMap(db);
    return db
        .select({ id: series.id, sources: series.sources })
        .from(series)
        .where(
            and(
                isNotNull(series.sources),
                visibleTo(viewer),
                // SQL brut : Drizzle ne préfixerait pas `series.id`.
                sql`not exists (select 1 from volumes v cross join read_progress rp on rp.volume_id = v.id where v.series_id = series.id)`,
            ),
        )
        .all()
        .flatMap(({ id, sources }) => {
            const rating = seriesRatingOf(parseSources(sources), ratings);
            return rating &&
                rating.count >= MIN_REVIEWS &&
                rating.value >= GOOD_RATING
                ? [{ id, rating: rating.value, reviews: rating.count }]
                : [];
        })
        .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
};
