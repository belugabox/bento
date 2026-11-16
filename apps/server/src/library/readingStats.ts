import { sql } from 'drizzle-orm';

import { classify } from '../classification';
import type { Db } from '../db';
import { notFound } from '../tools/errors';
import { genreCatalog } from './genres';
import type { VolumeKind } from './volumeKind';

// Requêtes en SQL brut, comme stats.ts (agrégats sur plusieurs tables).

/** Périodes de l'écran Statistiques : 7 jours, 30 jours, 12 mois, tout. */
export const STATS_PERIODS = ['7d', '30d', '12m', 'all'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
// Le calendrier montre toujours un an (53 semaines).
const CALENDAR_DAYS = 371;
// Série sans lecture depuis 2 mois, pas finie : abandonnée.
export const ABANDONED_DAYS = 60;

export type StatsOptions = {
    period: StatsPeriod;
    /** Décalage horaire de l'appareil, en minutes (Paris : 60 ou 120). */
    tz: number;
    now?: Date;
};

/** Début de la période (ms), ou 0 pour tout. */
export const periodStart = (period: StatsPeriod, now: Date) => {
    const days = { '7d': 7, '30d': 30, '12m': 365, all: 0 }[period];
    return days ? now.getTime() - days * DAY_MS : 0;
};

/** Jour local d'une date en ms (« 2026-11-16 »), d'après le décalage. */
const localDay = (column: string, tz: number) =>
    sql.raw(`date(${column} / 1000 + ${Math.trunc(tz) * 60}, 'unixepoch')`);

/** Jours de lecture consécutifs : la série en cours et la plus longue. */
export const streaks = (days: string[], today: string) => {
    const sorted = [...new Set(days)].sort();
    const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;
    let best = 0;
    let run = 0;
    let previous: number | undefined;
    for (const day of sorted) {
        const n = dayNumber(day);
        run = previous !== undefined && n === previous + 1 ? run + 1 : 1;
        best = Math.max(best, run);
        previous = n;
    }
    // La série en cours tient encore si on a lu hier (pas encore aujourd'hui).
    const last = previous;
    const current =
        last !== undefined && dayNumber(today) - last <= 1 ? run : 0;
    return { current, best };
};

/**
 * Activité de lecture : temps et pages par jour et par lecteur (pour la
 * période et le calendrier d'un an), et moments de lecture (jour de la
 * semaine × heure, séances de Bento seulement : Kavita ne donnait pas
 * l'heure). Pour un lecteur seul avec `userId`.
 */
export const readingActivity = (
    db: Db,
    { period, tz, now = new Date() }: StatsOptions,
    userId?: number,
) => {
    const start = periodStart(period, now);
    const calendarStart = now.getTime() - CALENDAR_DAYS * DAY_MS;
    const since = start === 0 ? 0 : Math.min(start, calendarStart);
    const forUser =
        userId === undefined ? sql`` : sql`and rs.user_id = ${userId}`;
    const day = localDay('rs.started_at', tz);

    const daily = db.all<{
        day: string;
        userId: number;
        seconds: number;
        pages: number;
    }>(sql`
        select ${day} as day, rs.user_id as userId,
            sum(rs.ended_at - rs.started_at) / 1000 as seconds,
            sum(rs.pages) as pages
        from reading_sessions rs
        where rs.started_at >= ${since} ${forUser}
        group by 1, 2
        order by 1`);

    const shifted = `rs.started_at / 1000 + ${Math.trunc(tz) * 60}`;
    const hours = db.all<{
        weekday: number;
        hour: number;
        seconds: number;
    }>(sql`
        select cast(strftime('%w', ${sql.raw(shifted)}, 'unixepoch') as integer) as weekday,
            cast(strftime('%H', ${sql.raw(shifted)}, 'unixepoch') as integer) as hour,
            sum(rs.ended_at - rs.started_at) / 1000 as seconds
        from reading_sessions rs
        where rs.source = 'bento' and rs.started_at >= ${start} ${forUser}
        group by 1, 2`);

    return { start: new Date(start).toISOString(), daily, hours };
};

/** Chiffres de chaque personne sur la période. */
export const readerTotals = (
    db: Db,
    { period, tz, now = new Date() }: StatsOptions,
    userId?: number,
) => {
    const start = periodStart(period, now);
    const forUser = userId === undefined ? sql`` : sql`where u.id = ${userId}`;
    const day = localDay('rs.started_at', tz);
    return db
        .all<{
            id: number;
            name: string;
            role: 'admin' | 'reader';
            seconds: number;
            pages: number;
            sessions: number;
            days: number;
            completed: number;
            lastReadAt: number | null;
        }>(
            sql`
        select u.id, u.name, u.role,
            coalesce(s.seconds, 0) as seconds,
            coalesce(s.pages, 0) as pages,
            coalesce(s.sessions, 0) as sessions,
            coalesce(s.days, 0) as days,
            (select count(*) from read_progress rp
                where rp.user_id = u.id and rp.completed = 1
                    and rp.updated_at >= ${start}) as completed,
            (select max(rp.updated_at) from read_progress rp
                where rp.user_id = u.id) as lastReadAt
        from users u
        left join (
            select rs.user_id,
                sum(rs.ended_at - rs.started_at) / 1000 as seconds,
                sum(rs.pages) as pages,
                count(*) as sessions,
                count(distinct ${day}) as days
            from reading_sessions rs
            where rs.started_at >= ${start}
            group by rs.user_id
        ) s on s.user_id = u.id
        ${forUser}
        order by seconds desc, lastReadAt desc nulls last, u.name`,
        )
        .map((row) => ({
            ...row,
            lastReadAt:
                row.lastReadAt === null
                    ? null
                    : new Date(row.lastReadAt).toISOString(),
        }));
};

/** Vue d'ensemble de la lecture sur la période (écran Statistiques). */
export const readingOverview = (db: Db, options: StatsOptions) => ({
    ...readingActivity(db, options),
    readers: readerTotals(db, options),
});

/**
 * Fiche d'un lecteur : ses chiffres sur la période (vitesse, séances,
 * jours d'affilée), ses genres et formats préférés, ses séries (finies, en
 * cours, abandonnées) et son historique.
 */
export const readerStats = (db: Db, userId: number, options: StatsOptions) => {
    const now = options.now ?? new Date();
    const [totals] = readerTotals(db, { ...options, now }, userId);
    if (!totals) throw notFound('Personne introuvable');
    const start = periodStart(options.period, now);
    const day = localDay('rs.started_at', options.tz);

    // Vitesse : seulement les séances qui comptent leurs pages.
    const pace = db.get<{ seconds: number; pages: number }>(sql`
        select coalesce(sum(rs.ended_at - rs.started_at), 0) / 1000 as seconds,
            coalesce(sum(rs.pages), 0) as pages
        from reading_sessions rs
        where rs.user_id = ${userId} and rs.pages > 0
            and rs.ended_at > rs.started_at and rs.started_at >= ${start}`)!;

    const allDays = db
        .all<{ day: string }>(
            sql`
            select distinct ${day} as day from reading_sessions rs
            where rs.user_id = ${userId}`,
        )
        .map((row) => row.day);
    const today = new Date(now.getTime() + options.tz * 60_000)
        .toISOString()
        .slice(0, 10);

    // Temps par série sur la période : genres et formats préférés.
    const timeBySeries = db.all<{
        seriesId: number;
        genre: string | null;
        tags: string | null;
        format: string | null;
        seconds: number;
    }>(sql`
        select s.id as seriesId, s.genre, s.tags, f.name as format,
            sum(rs.ended_at - rs.started_at) / 1000 as seconds
        from reading_sessions rs
        join volumes v on v.id = rs.volume_id
        join series s on s.id = v.series_id
        left join formats f on f.id = s.format_id
        where rs.user_id = ${userId} and rs.started_at >= ${start}
        group by s.id`);
    const catalog = genreCatalog(db);
    const genres = new Map<string, number>();
    const formats = new Map<string, number>();
    for (const row of timeBySeries) {
        for (const genre of classify(row.genre, row.tags, catalog).genres) {
            genres.set(genre, (genres.get(genre) ?? 0) + row.seconds);
        }
        const format = row.format ?? 'Sans format';
        formats.set(format, (formats.get(format) ?? 0) + row.seconds);
    }
    const ranked = (map: Map<string, number>) =>
        [...map]
            .map(([name, seconds]) => ({ name, seconds }))
            .sort(
                (a, b) =>
                    b.seconds - a.seconds || a.name.localeCompare(b.name, 'fr'),
            );

    // Séries ouvertes (depuis toujours) : tomes lus sur les tomes de la série.
    const series = db
        .all<{
            id: number;
            name: string;
            read: number;
            volumes: number;
            seconds: number;
            lastReadAt: number;
        }>(
            sql`
        select s.id, s.name,
            sum(rp.completed = 1 and v.kind in ('volume', 'one-shot', 'integrale')) as read,
            (select count(*) from volumes v2 where v2.series_id = s.id
                and v2.kind in ('volume', 'one-shot', 'integrale')) as volumes,
            coalesce((select sum(rs.ended_at - rs.started_at) / 1000
                from reading_sessions rs join volumes v3 on v3.id = rs.volume_id
                where rs.user_id = ${userId} and v3.series_id = s.id), 0)
                as seconds,
            max(rp.updated_at) as lastReadAt
        from read_progress rp
        join volumes v on v.id = rp.volume_id
        join series s on s.id = v.series_id
        where rp.user_id = ${userId}
        group by s.id
        order by lastReadAt desc`,
        )
        .map((row) => ({
            ...row,
            state:
                row.volumes > 0 && row.read >= row.volumes
                    ? ('finished' as const)
                    : now.getTime() - row.lastReadAt > ABANDONED_DAYS * DAY_MS
                      ? ('abandoned' as const)
                      : ('reading' as const),
            lastReadAt: new Date(row.lastReadAt).toISOString(),
        }));

    // Historique : chaque tome ouvert, le plus récent d'abord.
    const history = db
        .all<{
            seriesId: number;
            seriesName: string;
            volumeId: number;
            number: string | null;
            kind: VolumeKind;
            page: number;
            pageCount: number;
            completed: number;
            updatedAt: number;
            seconds: number;
        }>(
            sql`
        select s.id as seriesId, s.name as seriesName, v.id as volumeId,
            v.number, v.kind, rp.page, v.page_count as pageCount,
            rp.completed, rp.updated_at as updatedAt,
            coalesce((select sum(rs.ended_at - rs.started_at) / 1000
                from reading_sessions rs
                where rs.user_id = ${userId} and rs.volume_id = v.id), 0)
                as seconds
        from read_progress rp
        join volumes v on v.id = rp.volume_id
        join series s on s.id = v.series_id
        where rp.user_id = ${userId}
        order by rp.updated_at desc
        limit 200`,
        )
        .map((row) => ({
            ...row,
            completed: row.completed === 1,
            updatedAt: new Date(row.updatedAt).toISOString(),
        }));

    return {
        ...totals,
        averageSessionSeconds: totals.sessions
            ? Math.round(totals.seconds / totals.sessions)
            : 0,
        pagesPerMinute:
            pace.seconds > 0
                ? Math.round((pace.pages / (pace.seconds / 60)) * 10) / 10
                : null,
        streaks: streaks(allDays, today),
        genres: ranked(genres),
        formats: ranked(formats),
        series,
        history,
        ...readingActivity(db, { ...options, now }, userId),
    };
};
