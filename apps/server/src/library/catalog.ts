import { and, asc, count, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import {
    type Audience,
    type Format,
    type GenreEntry,
    classify,
    defaultFormat,
} from '../classification';
import type { LibraryConfig } from '../config';
import type { Db } from '../db';
import { libraries, readProgress, series, volumes } from '../db/schema';
import { notFound } from '../tools/errors';
import { genreCatalog } from './genres';
import { publicationPathOf } from './paths';
import { coverFile } from './scanner';
import { compareNames } from './sortName';
import { type Viewer, visibleTo } from './visibility';

// Tomes sans numéro en dernier, puis par numéro, puis par fichier.
/**
 * Version d'un tome : la date de son fichier, qui change à chaque réécriture.
 * Dans l'adresse de ses images, elle permet au navigateur de les garder.
 */
export const volumeVersion = sql<number>`cast(${volumes.mtimeMs} as integer)`;

export const volumeOrder = [
    sql`${volumes.sortNumber} is null`,
    asc(volumes.sortNumber),
    asc(volumes.file),
];

/**
 * Listes de la personne et collections d'une série (SQL brut : Drizzle ne
 * préfixe pas les colonnes des sous-requêtes).
 */
const listsOf = (viewer: Viewer) => ({
    toRead: sql<boolean>`exists(select 1 from series_lists sl where sl.series_id = series.id and sl.user_id = ${viewer.id} and sl.list = 'toread')`.mapWith(
        Boolean,
    ),
    collectionIds: sql<
        number[]
    >`coalesce((select group_concat(cs.collection_id) from collection_series cs where cs.series_id = series.id), '')`.mapWith(
        (value: string) => (value ? value.split(',').map(Number) : []),
    ),
});

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
        .all()
        .map((library) => ({
            ...library,
            defaultReadingMode: defaultReadingMode(library.type),
        }));

/**
 * Format, public, genres et thèmes d'une série, d'après ses réglages et
 * les genres bruts de ses fichiers rangés par la liste des genres.
 */
const classified = (
    row: {
        genre: string | null;
        tags: string | null;
        format: Format | null;
        audience: Audience | null;
    },
    libraryType: 'manga' | 'comics',
    catalog: GenreEntry[],
) => {
    const { genres, themes, audience } = classify(row.genre, row.tags, catalog);
    return {
        format: row.format,
        defaultFormat: defaultFormat(libraryType),
        audience: row.audience,
        // Public trouvé parmi les genres d'un ancien fichier.
        defaultAudience: audience,
        genres,
        themes,
    };
};

/**
 * Séries, filtrées par bibliothèque et par texte (nom, genres et thèmes,
 * sans tenir compte de la casse).
 */
export const listSeries = (
    db: Db,
    viewer: Viewer,
    { libraryId, search }: { libraryId?: number; search?: string } = {},
) => {
    const text = search?.trim().toLowerCase();
    const catalog = genreCatalog(db);
    return db
        .select({
            id: series.id,
            libraryId: series.libraryId,
            libraryType: libraries.type,
            name: series.name,
            year: series.year,
            genre: series.genre,
            tags: series.tags,
            format: series.format,
            audience: series.audience,
            status: series.status,
            volumeCount: count(volumes.id),
            // Dernier tome ajouté (tri « ajouts récents »).
            lastAddedAt: sql<number>`max(${volumes.addedAt})`.mapWith(
                (value: number) => new Date(value * 1000),
            ),
            // Couverture de la série : celle de son premier tome (et sa version).
            // Sous-requêtes en SQL brut : Drizzle n'y préfixe pas les colonnes
            // par leur table.
            coverUpdatedAt: series.coverUpdatedAt,
            coverVolumeId: sql<number>`(select v.id from volumes v where v.series_id = series.id order by v.sort_number is null, v.sort_number, v.file limit 1)`,
            coverVolumeVersion: sql<number>`(select cast(v.mtime_ms as integer) from volumes v where v.series_id = series.id order by v.sort_number is null, v.sort_number, v.file limit 1)`,
            // Tomes lus par la personne.
            readCount: sql<number>`(select count(*) from read_progress rp join volumes v on v.id = rp.volume_id where v.series_id = series.id and rp.user_id = ${viewer.id} and rp.completed = 1)`,
            // Tomes ouverts (lus ou en cours) : série commencée.
            startedCount: sql<number>`(select count(*) from read_progress rp join volumes v on v.id = rp.volume_id where v.series_id = series.id and rp.user_id = ${viewer.id})`,
            ...listsOf(viewer),
        })
        .from(series)
        .innerJoin(libraries, eq(libraries.id, series.libraryId))
        .leftJoin(volumes, eq(volumes.seriesId, series.id))
        .where(
            and(
                libraryId === undefined
                    ? undefined
                    : eq(series.libraryId, libraryId),
                text
                    ? sql`(lower(${series.name}) like ${`%${text}%`} or lower(coalesce(${series.genre}, '') || ',' || coalesce(${series.tags}, '')) like ${`%${text}%`})`
                    : undefined,
                visibleTo(viewer),
            ),
        )
        .groupBy(series.id)
        .all()
        .sort((a, b) => compareNames(a.name, b.name))
        .map(({ genre, tags, format, audience, libraryType, ...row }) => {
            const found = classified(
                { genre, tags, format, audience },
                libraryType,
                catalog,
            );
            return {
                ...row,
                // Réglages de la série, sinon ses valeurs par défaut.
                format: found.format ?? found.defaultFormat,
                audience: found.audience ?? found.defaultAudience,
                genres: found.genres,
                themes: found.themes,
            };
        });
};

export const getSeries = (db: Db, viewer: Viewer, id: number) => {
    const row = db
        .select({
            id: series.id,
            name: series.name,
            summary: series.summary,
            genre: series.genre,
            tags: series.tags,
            format: series.format,
            audience: series.audience,
            ageRating: series.ageRating,
            minAge: series.minAge,
            coverUpdatedAt: series.coverUpdatedAt,
            year: series.year,
            status: series.status,
            readingMode: series.readingMode,
            writer: series.writer,
            publisher: series.publisher,
            ...listsOf(viewer),
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
            version: volumeVersion,
            size: volumes.size,
            addedAt: volumes.addedAt,
            file: volumes.file,
            comicInfo: volumes.comicInfo,
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
    const { genre, tags, ...details } = row;
    const classification = classified(row, row.library.type, genreCatalog(db));
    return {
        ...details,
        ...classification,
        defaultReadingMode: defaultReadingMode(
            row.library.type,
            classification.format ?? classification.defaultFormat,
        ),
        volumes: items.map(({ file, comicInfo, ...volume }) => ({
            ...volume,
            // Gestion des métadonnées : seulement pour un admin.
            admin:
                viewer.role === 'admin'
                    ? {
                          file,
                          comicInfo,
                          publicationPath: publicationPathOf(comicInfo) ?? null,
                      }
                    : null,
        })),
    };
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
            version: volumeVersion,
            pageSizes: volumes.pageSizes,
            file: volumes.file,
            libraryPath: libraries.path,
            libraryType: libraries.type,
            seriesReadingMode: series.readingMode,
            seriesFormat: series.format,
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
    const {
        file,
        libraryPath,
        seriesReadingMode: _mode,
        seriesFormat: _format,
        ...volume
    } = row;
    return {
        ...volume,
        readingMode:
            row.seriesReadingMode ??
            defaultReadingMode(row.libraryType, row.seriesFormat),
        previousId: siblings[index - 1] ?? null,
        nextId: siblings[index + 1] ?? null,
        fullPath: path.join(libraryPath, ...file.split('/')),
    };
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

/**
 * Couverture à servir pour une série visible par la personne : celle
 * choisie, sinon celle de son premier tome.
 */
export const seriesCoverOf = (db: Db, viewer: Viewer, id: number) => {
    const row = db
        .select({
            coverUpdatedAt: series.coverUpdatedAt,
            firstVolumeId: sql<
                number | null
            >`(select v.id from volumes v where v.series_id = series.id order by v.sort_number is null, v.sort_number, v.file limit 1)`,
        })
        .from(series)
        .where(and(eq(series.id, id), visibleTo(viewer)))
        .get();
    if (!row) throw notFound('Série introuvable');
    return row;
};

export type SeriesStatus = 'ongoing' | 'completed';

/** Série en cours de parution ou terminée (null : inconnu). */
export const setSeriesStatus = (
    db: Db,
    id: number,
    status: SeriesStatus | null,
) => {
    const updated = db
        .update(series)
        .set({ status })
        .where(eq(series.id, id))
        .returning({ status: series.status })
        .get();
    if (!updated) throw notFound('Série introuvable');
    return updated;
};

export type ReadingMode = 'ltr' | 'ltr-manga' | 'rtl' | 'webtoon';

/**
 * Mode de lecture par défaut : défilement pour un webtoon, manga de gauche
 * à droite (doubles pages inversées) pour un manga, BD sinon. Sans format
 * choisi, celui de la bibliothèque.
 */
export const defaultReadingMode = (
    libraryType: 'manga' | 'comics',
    format?: Format | null,
): ReadingMode => {
    const effective = format ?? defaultFormat(libraryType);
    if (effective === 'webtoon') return 'webtoon';
    return effective === 'manga' ? 'ltr-manga' : 'ltr';
};

/** Format et public d'une série (null : par défaut, inconnu). */
export const setSeriesClassification = (
    db: Db,
    id: number,
    changes: { format?: Format | null; audience?: Audience | null },
) => {
    const updated = db
        .update(series)
        .set(changes)
        .where(eq(series.id, id))
        .returning({ format: series.format, audience: series.audience })
        .get();
    if (!updated) throw notFound('Série introuvable');
    return updated;
};

/** Mode de lecture d'une série (null : celui de la bibliothèque). */
export const setSeriesReadingMode = (
    db: Db,
    id: number,
    readingMode: ReadingMode | null,
) => {
    const updated = db
        .update(series)
        .set({ readingMode })
        .where(eq(series.id, id))
        .returning({ readingMode: series.readingMode })
        .get();
    if (!updated) throw notFound('Série introuvable');
    return updated;
};
