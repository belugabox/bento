import { eq, sql } from 'drizzle-orm';

import { classify } from '../classification';
import type { Db } from '../db';
import { formats, libraries, series, volumes } from '../db/schema';
import { coverVolumeSql } from './catalog';
import { genreCatalog } from './genres';
import { compareNames } from './sortName';

/** Séries à classer : sans format, ou sans âge (choisi ou déduit des tomes). */
const toClassifySql = sql`(series.format_id is null or coalesce(series.age, series.min_age) is null)`;

/**
 * Gestion des séries (admin) : toutes les séries, avec ce qu'il faut pour
 * les classer et les trier (fiche, taille, pages, dates). À part de la
 * liste de l'accueil, qu'elle n'alourdit pas.
 */
export const listManagedSeries = (db: Db) => {
    const catalog = genreCatalog(db);
    return db
        .select({
            id: series.id,
            libraryId: series.libraryId,
            libraryName: libraries.name,
            name: series.name,
            genre: series.genre,
            tags: series.tags,
            formatId: series.formatId,
            format: formats.name,
            // Âge choisi dans Bento, et celui déduit des tomes.
            age: series.age,
            fileAge: series.minAge,
            status: series.status,
            hasSummary:
                sql<boolean>`coalesce(trim(series.summary), '') != ''`.mapWith(
                    Boolean,
                ),
            writer: series.writer,
            publisher: series.publisher,
            penciller: sql<
                string | null
            >`(select json_extract(v.comic_info, '$.Penciller') from volumes v where v.series_id = series.id order by v.kind != 'volume', v.kind, v.sort_number is null, v.sort_number, v.file limit 1)`,
            volumeCount: sql<number>`count(${volumes.id})`,
            // Tomes au numéro et à l'année renseignés (complétude).
            withNumber: sql<number>`count(case when coalesce(trim(${volumes.number}), '') != '' then 1 end)`,
            withYear: sql<number>`count(json_extract(${volumes.comicInfo}, '$.Year'))`,
            pageCount: sql<number>`coalesce(sum(${volumes.pageCount}), 0)`,
            size: sql<number>`coalesce(sum(${volumes.size}), 0)`,
            firstAddedAt: sql<number | null>`min(${volumes.addedAt})`.mapWith(
                (value: number | null) =>
                    value === null ? null : new Date(value * 1000),
            ),
            lastAddedAt: sql<number | null>`max(${volumes.addedAt})`.mapWith(
                (value: number | null) =>
                    value === null ? null : new Date(value * 1000),
            ),
            coverUpdatedAt: series.coverUpdatedAt,
            ...coverVolumeSql,
        })
        .from(series)
        .innerJoin(libraries, eq(libraries.id, series.libraryId))
        .leftJoin(formats, eq(formats.id, series.formatId))
        .leftJoin(volumes, eq(volumes.seriesId, series.id))
        .groupBy(series.id)
        .all()
        .sort((a, b) => compareNames(a.name, b.name))
        .map(({ genre, tags, ...row }) => ({
            ...row,
            ...classify(genre, tags, catalog),
        }));
};

/** Nombre de séries à classer (compteur du menu). */
export const countToClassify = (db: Db) =>
    db.get<{ count: number }>(
        sql`select count(*) as count from series where ${toClassifySql}`,
    ).count;
