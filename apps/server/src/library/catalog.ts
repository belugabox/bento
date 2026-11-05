import { and, asc, count, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import type { LibraryConfig } from '../config';
import type { Db } from '../db';
import { libraries, readProgress, series, volumes } from '../db/schema';
import { notFound } from '../tools/errors';
import { seriesAge } from './ageRating';
import { coverFile } from './scanner';
import { type Viewer, visibleTo } from './visibility';

// Tomes sans numéro en dernier, puis par numéro, puis par fichier.
const volumeOrder = [
    sql`${volumes.sortNumber} is null`,
    asc(volumes.sortNumber),
    asc(volumes.file),
];

/**
 * Aligne les bibliothèques en base sur la configuration (identifiées par
 * leur dossier). Celles retirées de la configuration sont oubliées, avec
 * leurs séries, tomes et couvertures ; les fichiers ne sont pas touchés.
 */
export const syncLibraries = async (
    db: Db,
    configs: LibraryConfig[],
    coversPath: string,
) => {
    for (const library of configs) {
        db.insert(libraries)
            .values(library)
            .onConflictDoUpdate({
                target: libraries.path,
                set: { name: library.name, type: library.type },
            })
            .run();
    }
    const paths = configs.map((library) => library.path);
    const removed = db
        .select({ id: libraries.id })
        .from(libraries)
        .where(paths.length > 0 ? notInArray(libraries.path, paths) : undefined)
        .all()
        .map((library) => library.id);
    if (removed.length > 0) {
        const covers = db
            .select({ id: volumes.id })
            .from(volumes)
            .where(inArray(volumes.libraryId, removed))
            .all();
        db.delete(libraries).where(inArray(libraries.id, removed)).run();
        await Promise.all(
            covers.map((v) => rm(coverFile(coversPath, v.id), { force: true })),
        );
    }
    return db.select().from(libraries).all();
};

export const listLibraries = (db: Db) =>
    db
        .select({
            id: libraries.id,
            name: libraries.name,
            type: libraries.type,
            lastScanAt: libraries.lastScanAt,
            seriesCount: sql<number>`(select count(*) from series where series.library_id = libraries.id)`,
            volumeCount: sql<number>`(select count(*) from volumes where volumes.library_id = libraries.id)`,
        })
        .from(libraries)
        .orderBy(asc(libraries.name))
        .all();

/** Séries, filtrées par bibliothèque et par nom (sans tenir compte de la casse). */
export const listSeries = (
    db: Db,
    viewer: Viewer,
    { libraryId, search }: { libraryId?: number; search?: string } = {},
) => {
    const text = search?.trim().toLowerCase();
    return db
        .select({
            id: series.id,
            libraryId: series.libraryId,
            name: series.name,
            year: series.year,
            genre: series.genre,
            count: series.count,
            volumeCount: count(volumes.id),
            // Couverture de la série : celle de son premier tome. Sous-requêtes en
            // SQL brut : Drizzle n'y préfixe pas les colonnes par leur table.
            coverVolumeId: sql<number>`(select v.id from volumes v where v.series_id = series.id order by v.sort_number is null, v.sort_number, v.file limit 1)`,
            // Tomes lus par la personne.
            readCount: sql<number>`(select count(*) from read_progress rp join volumes v on v.id = rp.volume_id where v.series_id = series.id and rp.user_id = ${viewer.id} and rp.completed = 1)`,
        })
        .from(series)
        .leftJoin(volumes, eq(volumes.seriesId, series.id))
        .where(
            and(
                libraryId === undefined
                    ? undefined
                    : eq(series.libraryId, libraryId),
                text
                    ? sql`lower(${series.name}) like ${`%${text}%`}`
                    : undefined,
                visibleTo(viewer),
            ),
        )
        .groupBy(series.id)
        .orderBy(sql`${series.name} collate nocase`)
        .all();
};

export const getSeries = (db: Db, viewer: Viewer, id: number) => {
    const row = db
        .select({
            id: series.id,
            name: series.name,
            summary: series.summary,
            genre: series.genre,
            ageRating: series.ageRating,
            ageRatingOverride: series.ageRatingOverride,
            minAge: series.minAge,
            year: series.year,
            count: series.count,
            writer: series.writer,
            publisher: series.publisher,
            library: {
                id: libraries.id,
                name: libraries.name,
                type: libraries.type,
            },
        })
        .from(series)
        .innerJoin(libraries, eq(libraries.id, series.libraryId))
        .where(and(eq(series.id, id), visibleTo(viewer)))
        .get();
    if (!row) throw notFound('Série introuvable');
    const items = db
        .select({
            id: volumes.id,
            number: volumes.number,
            title: volumes.title,
            pageCount: volumes.pageCount,
            size: volumes.size,
            addedAt: volumes.addedAt,
            // Progression de la personne ; null = pas commencé.
            progress: {
                page: readProgress.page,
                completed: readProgress.completed,
            },
        })
        .from(volumes)
        .leftJoin(
            readProgress,
            and(
                eq(readProgress.volumeId, volumes.id),
                eq(readProgress.userId, viewer.id),
            ),
        )
        .where(eq(volumes.seriesId, id))
        .orderBy(...volumeOrder)
        .all();
    return { ...row, volumes: items };
};

/**
 * Un tome, avec ce qu'il faut pour le lire et passer au précédent / suivant.
 * Introuvable si sa série est masquée à la personne.
 */
export const getVolume = (db: Db, viewer: Viewer, id: number) => {
    const row = db
        .select({
            id: volumes.id,
            seriesId: volumes.seriesId,
            seriesName: series.name,
            number: volumes.number,
            title: volumes.title,
            pageCount: volumes.pageCount,
            pageSizes: volumes.pageSizes,
            file: volumes.file,
            libraryPath: libraries.path,
            libraryType: libraries.type,
        })
        .from(volumes)
        .innerJoin(series, eq(series.id, volumes.seriesId))
        .innerJoin(libraries, eq(libraries.id, volumes.libraryId))
        .where(and(eq(volumes.id, id), visibleTo(viewer)))
        .get();
    if (!row) throw notFound('Tome introuvable');
    const siblings = db
        .select({ id: volumes.id })
        .from(volumes)
        .where(eq(volumes.seriesId, row.seriesId))
        .orderBy(...volumeOrder)
        .all()
        .map((v) => v.id);
    const index = siblings.indexOf(row.id);
    const { file, libraryPath, ...volume } = row;
    return {
        ...volume,
        // Sens de lecture par défaut, réglable par série dans le lecteur.
        direction: 'ltr' as 'ltr' | 'rtl',
        previousId: siblings[index - 1] ?? null,
        nextId: siblings[index + 1] ?? null,
        fullPath: path.join(libraryPath, ...file.split('/')),
    };
};

/**
 * Classification d'une série choisie dans Bento (`null` : revenir à celle
 * des tomes). Recalcule aussitôt son âge minimal.
 */
export const setSeriesAgeRating = (
    db: Db,
    id: number,
    override: string | null,
) => {
    const ratings = db
        .select({ comicInfo: volumes.comicInfo })
        .from(volumes)
        .where(eq(volumes.seriesId, id))
        .all()
        .map((v) => v.comicInfo.AgeRating);
    const updated = db
        .update(series)
        .set({ ageRatingOverride: override, ...seriesAge(override, ratings) })
        .where(eq(series.id, id))
        .returning({ ageRating: series.ageRating, minAge: series.minAge })
        .get();
    if (!updated) throw notFound('Série introuvable');
    return { ...updated, ageRatingOverride: override };
};

export const savePageSizes = (
    db: Db,
    volumeId: number,
    sizes: [number, number][],
) =>
    db
        .update(volumes)
        .set({ pageSizes: sizes })
        .where(eq(volumes.id, volumeId))
        .run();
