import { sql } from 'drizzle-orm';

import type { Db } from '../db';

// Requêtes en SQL brut : agrégats sur plusieurs tables (voir catalog.ts :
// Drizzle ne préfixe pas les colonnes dans les sous-requêtes).

/** Chiffres de la bibliothèque et de la lecture, pour les admins. */
export const getStats = (db: Db) => {
    const libraries = db.all<{
        id: number;
        name: string;
        type: 'manga' | 'comics';
        lastScanAt: number | null;
        series: number;
        volumes: number;
        pages: number;
        size: number;
    }>(sql`
        select l.id, l.name, l.type, l.last_scan_at as lastScanAt,
            (select count(*) from series s where s.library_id = l.id) as series,
            count(v.id) as volumes,
            coalesce(sum(v.page_count), 0) as pages,
            coalesce(sum(v.size), 0) as size
        from libraries l
        left join volumes v on v.library_id = l.id
        group by l.id
        order by l.name`);

    const ratings = db.all<{ minAge: number | null; series: number }>(sql`
        select min_age as minAge, count(*) as series
        from series group by min_age order by min_age`);

    const statuses = db.all<{ status: string | null; series: number }>(sql`
        select status, count(*) as series from series group by status`);

    const readers = db.all<{
        id: number;
        name: string;
        role: 'admin' | 'reader';
        maxAge: number | null;
        lastLoginAt: number | null;
        completed: number;
        inProgress: number;
        lastReadAt: number | null;
    }>(sql`
        select u.id, u.name, u.role, u.max_age as maxAge,
            u.last_login_at as lastLoginAt,
            coalesce(sum(rp.completed = 1), 0) as completed,
            coalesce(sum(rp.completed = 0), 0) as inProgress,
            max(rp.updated_at) as lastReadAt
        from users u
        left join read_progress rp on rp.user_id = u.id
        group by u.id
        order by lastReadAt desc nulls last, u.name`);

    const recent = db.all<{
        userName: string;
        seriesId: number;
        seriesName: string;
        volumeId: number;
        number: string | null;
        page: number;
        pageCount: number;
        completed: number;
        updatedAt: number;
    }>(sql`
        select u.name as userName, s.id as seriesId, s.name as seriesName,
            v.id as volumeId, v.number, rp.page, v.page_count as pageCount,
            rp.completed, rp.updated_at as updatedAt
        from read_progress rp
        join users u on u.id = rp.user_id
        join volumes v on v.id = rp.volume_id
        join series s on s.id = v.series_id
        order by rp.updated_at desc
        limit 10`);

    const topSeries = db.all<{
        id: number;
        name: string;
        readers: number;
        completed: number;
    }>(sql`
        select s.id, s.name,
            count(distinct rp.user_id) as readers,
            coalesce(sum(rp.completed = 1), 0) as completed
        from read_progress rp
        join volumes v on v.id = rp.volume_id
        join series s on s.id = v.series_id
        group by s.id
        order by readers desc, completed desc, s.name
        limit 5`);

    // Dates : secondes (dernier scan, connexion) ou millisecondes (lecture).
    const fromSeconds = (value: number | null) =>
        value === null ? null : new Date(value * 1000).toISOString();
    const fromMs = (value: number | null) =>
        value === null ? null : new Date(value).toISOString();

    return {
        libraries: libraries.map((l) => ({
            ...l,
            lastScanAt: fromSeconds(l.lastScanAt),
        })),
        ratings,
        statuses: {
            ongoing: statuses.find((s) => s.status === 'ongoing')?.series ?? 0,
            completed:
                statuses.find((s) => s.status === 'completed')?.series ?? 0,
            unknown: statuses.find((s) => s.status === null)?.series ?? 0,
        },
        readers: readers.map((r) => ({
            ...r,
            lastLoginAt: fromSeconds(r.lastLoginAt),
            lastReadAt: fromMs(r.lastReadAt),
        })),
        recent: recent.map((r) => ({
            ...r,
            completed: r.completed === 1,
            updatedAt: fromMs(r.updatedAt)!,
        })),
        topSeries,
    };
};
