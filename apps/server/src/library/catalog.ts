import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import {
    type ReadingMode,
    classify,
    genreKey,
    splitList,
} from '../classification';
import type { LibraryConfig } from '../config';
import type { Db } from '../db';
import {
    formats,
    libraries,
    readProgress,
    series,
    volumes,
} from '../db/schema';
import {
    type SourceLink,
    parseSources,
    sourcesText,
} from '../metadata/sourceLink';
import { notFound } from '../tools/errors';
import { genreCatalog } from './genres';
import { publicationPathOf } from './paths';
import { coverFile, kindOrder } from './scanner';
import { compareNames } from './sortName';
import { type Viewer, visibleTo } from './visibility';
import { MAIN_KINDS } from './volumeKind';

/**
 * Version d'un tome : la date de son fichier, qui change à chaque réécriture.
 * Dans l'adresse de ses images, elle permet au navigateur de les garder.
 */
export const volumeVersion = sql<number>`cast(${volumes.mtimeMs} as integer)`;

// Types de la série elle-même, en SQL : `('volume', 'one-shot', …)`.
const MAIN_KINDS_SQL = `(${MAIN_KINDS.map((k) => `'${k}'`).join(', ')})`;

/**
 * Tome compté d'une série (« 12 tomes », « 3 / 12 lus », série lue) : un
 * tome, un one-shot ou une intégrale, pas un hors-série ni un spécial ;
 * tous si la série n'a que ceux-là. `alias` : nom de la table des tomes
 * dans la requête.
 */
export const countedVolume = (alias: string) =>
    sql.raw(
        `(${alias}.kind in ${MAIN_KINDS_SQL} or not exists (select 1 from volumes w where w.series_id = ${alias}.series_id and w.kind in ${MAIN_KINDS_SQL}))`,
    );

// Tomes, hors-séries puis spéciaux ; sans numéro en dernier, puis par
// numéro, puis par fichier.
export const volumeOrder = [
    kindOrder,
    sql`${volumes.sortNumber} is null`,
    asc(volumes.sortNumber),
    asc(volumes.file),
];

/**
 * Listes de la personne pour une série (SQL brut : Drizzle ne préfixe pas
 * les colonnes des sous-requêtes).
 */
const listsOf = (viewer: Viewer) => ({
    toRead: sql<boolean>`exists(select 1 from series_lists sl where sl.series_id = series.id and sl.user_id = ${viewer.id} and sl.list = 'toread')`.mapWith(
        Boolean,
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
 * Âge minimal d'une série : celui choisi dans Bento, sinon celui déduit de
 * la classification de ses tomes ; null = inconnu.
 */
export const seriesAgeSql = sql<
    number | null
>`coalesce(${series.age}, ${series.minAge})`;

/**
 * Séries, filtrées par bibliothèque et par texte (nom, genres et thèmes,
 * auteurs, sans tenir compte de la casse).
 */
/**
 * Couverture d'une série : celle de son premier tome, et sa version.
 * Sous-requêtes en SQL brut : Drizzle n'y préfixe pas les colonnes par leur
 * table.
 */
export const coverVolumeSql = {
    coverVolumeId: sql<number>`(select v.id from volumes v where v.series_id = series.id order by v.kind != 'volume', v.kind, v.sort_number is null, v.sort_number, v.file limit 1)`,
    coverVolumeVersion: sql<number>`(select cast(v.mtime_ms as integer) from volumes v where v.series_id = series.id order by v.kind != 'volume', v.kind, v.sort_number is null, v.sort_number, v.file limit 1)`,
};

export const listSeries = (
    db: Db,
    viewer: Viewer,
    { libraryId, search }: { libraryId?: number; search?: string } = {},
) => {
    // Sans casse ni accents : « comedie » trouve « Comédie ».
    const text = search ? genreKey(search) : '';
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
            formatId: series.formatId,
            format: formats.name,
            age: seriesAgeSql,
            status: series.status,
            volumeCount: sql<number>`(select count(*) from volumes v where v.series_id = series.id and ${countedVolume('v')})`,
            // Types des tomes comptés (« volume,integrale ») : carte de
            // l'accueil (« One-shot »).
            volumeKinds: sql<string>`(select group_concat(distinct v.kind) from volumes v where v.series_id = series.id and ${countedVolume('v')})`,
            // Dernier tome ajouté (tri « ajouts récents »).
            lastAddedAt: sql<number>`max(${volumes.addedAt})`.mapWith(
                (value: number) => new Date(value * 1000),
            ),
            // Couverture de la série : celle de son premier tome (et sa version).
            // Sous-requêtes en SQL brut : Drizzle n'y préfixe pas les colonnes
            // par leur table.
            coverUpdatedAt: series.coverUpdatedAt,
            // Auteur (celui de la fiche) et dessin du premier tome : affichage
            // en liste.
            writer: series.writer,
            penciller: sql<
                string | null
            >`(select json_extract(v.comic_info, '$.Penciller') from volumes v where v.series_id = series.id order by v.kind != 'volume', v.kind, v.sort_number is null, v.sort_number, v.file limit 1)`,
            ...coverVolumeSql,
            // Tomes lus par la personne.
            // Tomes de la série d'abord (`cross join` : SQLite garde cet ordre), puis la
            // lecture de chacun : sinon SQLite parcourt toutes les lectures de la
            // personne pour chaque série (lent dès quelques centaines de séries).
            readCount: sql<number>`(select count(*) from volumes v cross join read_progress rp on rp.volume_id = v.id and rp.user_id = ${viewer.id} where v.series_id = series.id and rp.completed = 1 and ${countedVolume('v')})`,
            // Tomes ouverts (lus ou en cours) : série commencée.
            startedCount: sql<number>`(select count(*) from volumes v cross join read_progress rp on rp.volume_id = v.id and rp.user_id = ${viewer.id} where v.series_id = series.id)`,
            ...listsOf(viewer),
            // Auteurs des tomes (scénario, dessin), seulement pour chercher.
            authors: text
                ? sql<
                      string | null
                  >`(select group_concat(coalesce(json_extract(v.comic_info, '$.Writer'), '') || ',' || coalesce(json_extract(v.comic_info, '$.Penciller'), ''), ',') from volumes v where v.series_id = series.id)`
                : sql<string | null>`null`,
        })
        .from(series)
        .innerJoin(libraries, eq(libraries.id, series.libraryId))
        .leftJoin(formats, eq(formats.id, series.formatId))
        .leftJoin(volumes, eq(volumes.seriesId, series.id))
        .where(
            and(
                libraryId === undefined
                    ? undefined
                    : eq(series.libraryId, libraryId),
                visibleTo(viewer),
            ),
        )
        .groupBy(series.id)
        .all()
        .sort((a, b) => compareNames(a.name, b.name))
        .map(({ genre, tags, libraryType: _type, ...row }) => ({
            ...row,
            ...classify(genre, tags, catalog),
            // Genres tels qu'écrits dans les fichiers (« Humour »), cherchés
            // aussi.
            rawGenres: `${genre ?? ''},${tags ?? ''}`,
        }))
        .filter(
            (row) =>
                !text ||
                [
                    row.name,
                    row.rawGenres,
                    row.authors ?? '',
                    ...row.genres,
                    ...row.themes,
                ].some((value) => genreKey(value).includes(text)),
        )
        .map(({ rawGenres: _raw, authors: _authors, ...row }) => row);
};

export const getSeries = (db: Db, viewer: Viewer, id: number) => {
    const row = db
        .select({
            id: series.id,
            name: series.name,
            summary: series.summary,
            genre: series.genre,
            tags: series.tags,
            formatId: series.formatId,
            formatName: formats.name,
            formatReadingMode: formats.readingMode,
            ageRating: series.ageRating,
            // Âge choisi dans Bento, et celui déduit des tomes.
            age: series.age,
            fileAge: series.minAge,
            coverUpdatedAt: series.coverUpdatedAt,
            year: series.year,
            status: series.status,
            readingMode: series.readingMode,
            sources: series.sources,
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
        .leftJoin(formats, eq(formats.id, series.formatId))
        .where(and(eq(series.id, id), visibleTo(viewer)))
        .get();
    if (!row) throw notFound('Série introuvable');
    const items = db
        .select({
            id: volumes.id,
            number: volumes.number,
            kind: volumes.kind,
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
    const { genre, tags, formatName, formatReadingMode, sources, ...details } =
        row;
    return {
        ...details,
        format: formatName,
        sources: parseSources(sources),
        ...classify(genre, tags, genreCatalog(db)),
        defaultReadingMode: defaultReadingMode(
            row.library.type,
            formatReadingMode,
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
            kind: volumes.kind,
            title: volumes.title,
            pageCount: volumes.pageCount,
            version: volumeVersion,
            pageSizes: volumes.pageSizes,
            file: volumes.file,
            libraryPath: libraries.path,
            libraryType: libraries.type,
            seriesReadingMode: series.readingMode,
            formatReadingMode: formats.readingMode,
        })
        .from(volumes)
        .innerJoin(series, eq(series.id, volumes.seriesId))
        .leftJoin(formats, eq(formats.id, series.formatId))
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
        formatReadingMode: _formatMode,
        ...volume
    } = row;
    return {
        ...volume,
        readingMode:
            row.seriesReadingMode ??
            defaultReadingMode(row.libraryType, row.formatReadingMode),
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
            >`(select v.id from volumes v where v.series_id = series.id order by v.kind != 'volume', v.kind, v.sort_number is null, v.sort_number, v.file limit 1)`,
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

export type { ReadingMode };

/**
 * Mode de lecture par défaut : celui du format de la série, sinon celui
 * de sa bibliothèque (manga de gauche à droite, doubles pages inversées ;
 * BD sinon).
 */
export const defaultReadingMode = (
    libraryType: 'manga' | 'comics',
    formatReadingMode?: ReadingMode | null,
): ReadingMode =>
    formatReadingMode ?? (libraryType === 'manga' ? 'ltr-manga' : 'ltr');

/**
 * Format, âge et fiches en ligne d'une série, réglés dans Bento (null, ou
 * liste vide : pas choisis).
 */
export const setSeriesClassification = (
    db: Db,
    id: number,
    {
        sources,
        ...changes
    }: {
        formatId?: number | null;
        age?: number | null;
        sources?: SourceLink[];
    },
) => {
    const updated = db
        .update(series)
        .set({
            ...changes,
            ...(sources && { sources: sourcesText(sources) }),
        })
        .where(eq(series.id, id))
        .returning({
            formatId: series.formatId,
            age: series.age,
            sources: series.sources,
        })
        .get();
    if (!updated) throw notFound('Série introuvable');
    return { ...updated, sources: parseSources(updated.sources) };
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

/**
 * Scénaristes, dessinateurs et éditeurs déjà présents dans les tomes d'une
 * bibliothèque (une personne par nom, « A, B » compte pour deux) : les
 * suggestions de l'éditeur, pour éviter les doublons d'écriture.
 */
export const listCredits = (db: Db, libraryId: number) => {
    const valuesOf = (field: 'Writer' | 'Penciller' | 'Publisher') => {
        const rows = db
            .selectDistinct({
                value: sql<
                    string | null
                >`json_extract(${volumes.comicInfo}, ${`$.${field}`})`,
            })
            .from(volumes)
            .where(eq(volumes.libraryId, libraryId))
            .all();
        // Une seule écriture par nom, sans casse ni accents.
        const names = new Map<string, string>();
        for (const { value } of rows) {
            for (const name of splitList(value)) {
                names.set(genreKey(name), names.get(genreKey(name)) ?? name);
            }
        }
        return [...names.values()].sort((a, b) => a.localeCompare(b, 'fr'));
    };
    return {
        writers: valuesOf('Writer'),
        pencillers: valuesOf('Penciller'),
        publishers: valuesOf('Publisher'),
    };
};
