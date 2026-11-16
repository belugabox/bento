import { sql } from 'drizzle-orm';

import { classify, genreKey, splitList } from '../classification';
import type { Db } from '../db';
import { genreCatalog } from './genres';

// Requêtes en SQL brut, comme stats.ts (agrégats sur plusieurs tables).

// Classements : les premiers seulement.
const TOP = 10;

/**
 * Personnes d'un champ du ComicInfo : « A, B », mais aussi « A / B » et
 * « A - B » (espaces autour : « Ji-Hoon » reste un nom).
 */
const peopleOf = (value: string | null) =>
    splitList(value).flatMap((item) =>
        item
            .split(/\s+[/-]\s+/)
            .map((name) => name.trim())
            .filter(Boolean),
    );

/** Compte par nom, une écriture par personne (sans casse ni accents). */
const tally = () => {
    const counts = new Map<string, { name: string; series: number }>();
    return {
        add: (name: string) => {
            const key = genreKey(name);
            const entry = counts.get(key) ?? { name, series: 0 };
            // « HIROYA OKU » cède la place à « Hiroya Oku ».
            if (entry.name === entry.name.toUpperCase()) entry.name = name;
            entry.series++;
            counts.set(key, entry);
        },
        top: () =>
            [...counts.values()]
                .sort(
                    (a, b) =>
                        b.series - a.series ||
                        a.name.localeCompare(b.name, 'fr'),
                )
                .slice(0, TOP),
    };
};

/**
 * La bibliothèque en chiffres : tomes ajoutés par mois, formats, genres
 * (possédés et lus), éditeurs, auteurs, et les séries que personne n'a
 * jamais ouvertes.
 */
export const libraryStats = (db: Db) => {
    // Mois d'ajout : celui du tome, et celui de la série (son premier tome).
    const volumesByMonth = db.all<{
        month: string;
        volumes: number;
        size: number;
    }>(sql`
        select strftime('%Y-%m', v.added_at, 'unixepoch') as month,
            count(*) as volumes, sum(v.size) as size
        from volumes v
        where v.added_at is not null
        group by 1 order by 1`);
    const seriesByMonth = db.all<{ month: string; series: number }>(sql`
        select month, count(*) as series from (
            select strftime('%Y-%m', min(v.added_at), 'unixepoch') as month
            from volumes v where v.added_at is not null
            group by v.series_id)
        group by 1`);
    const growth = volumesByMonth.map((row) => ({
        ...row,
        series: seriesByMonth.find((s) => s.month === row.month)?.series ?? 0,
    }));

    const formats = db.all<{
        name: string | null;
        series: number;
        volumes: number;
        size: number;
    }>(sql`
        select f.name, count(distinct s.id) as series,
            count(v.id) as volumes, coalesce(sum(v.size), 0) as size
        from series s
        left join formats f on f.id = s.format_id
        left join volumes v on v.series_id = s.id
        group by f.id
        order by size desc`);

    // Genres : séries possédées, et temps de lecture de toute la famille.
    const seriesRows = db.all<{
        id: number;
        genre: string | null;
        tags: string | null;
        seconds: number;
    }>(sql`
        select s.id, s.genre, s.tags,
            coalesce((select sum(rs.ended_at - rs.started_at) / 1000
                from reading_sessions rs join volumes v on v.id = rs.volume_id
                where v.series_id = s.id), 0) as seconds
        from series s`);
    const catalog = genreCatalog(db);
    const genres = new Map<string, { series: number; seconds: number }>();
    for (const row of seriesRows) {
        for (const genre of classify(row.genre, row.tags, catalog).genres) {
            const entry = genres.get(genre) ?? { series: 0, seconds: 0 };
            entry.series++;
            entry.seconds += row.seconds;
            genres.set(genre, entry);
        }
    }

    // Éditeurs et auteurs, d'après les ComicInfo : une fois par série.
    const credits = db.all<{
        seriesId: number;
        publisher: string | null;
        writer: string | null;
        penciller: string | null;
    }>(sql`
        select distinct v.series_id as seriesId,
            json_extract(v.comic_info, '$.Publisher') as publisher,
            json_extract(v.comic_info, '$.Writer') as writer,
            json_extract(v.comic_info, '$.Penciller') as penciller
        from volumes v`);
    const publishers = tally();
    const authors = tally();
    const seen = { publishers: new Set<string>(), authors: new Set<string>() };
    for (const row of credits) {
        for (const name of splitList(row.publisher)) {
            const key = `${row.seriesId}\n${genreKey(name)}`;
            if (seen.publishers.has(key)) continue;
            seen.publishers.add(key);
            publishers.add(name);
        }
        // Scénariste et dessinateur à la fois : compté une fois.
        for (const name of [
            ...peopleOf(row.writer),
            ...peopleOf(row.penciller),
        ]) {
            const key = `${row.seriesId}\n${genreKey(name)}`;
            if (seen.authors.has(key)) continue;
            seen.authors.add(key);
            authors.add(name);
        }
    }

    // Séries jamais ouvertes, par personne : les plus anciennes d'abord.
    const dormant = db
        .all<{
            id: number;
            name: string;
            volumes: number;
            size: number;
            addedAt: number | null;
        }>(
            sql`
        select s.id, s.name, count(v.id) as volumes,
            coalesce(sum(v.size), 0) as size, min(v.added_at) as addedAt
        from series s
        join volumes v on v.series_id = s.id
        where not exists (
            select 1 from read_progress rp
            join volumes v2 on v2.id = rp.volume_id
            where v2.series_id = s.id)
        group by s.id
        order by addedAt, s.name`,
        )
        .map((row) => ({
            ...row,
            addedAt:
                row.addedAt === null
                    ? null
                    : new Date(row.addedAt * 1000).toISOString(),
        }));

    return {
        growth,
        formats: formats.map((f) => ({ ...f, name: f.name ?? 'Sans format' })),
        genres: [...genres]
            .map(([name, entry]) => ({ name, ...entry }))
            .sort(
                (a, b) =>
                    b.series - a.series || a.name.localeCompare(b.name, 'fr'),
            ),
        publishers: publishers.top(),
        authors: authors.top(),
        dormant,
    };
};
