import { sql } from 'drizzle-orm';
import {
    index,
    integer,
    primaryKey,
    real,
    sqliteTable,
    text,
    uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { ComicInfo } from '../archive/comicInfo';
import { READING_MODES } from '../classification';
import { VOLUME_KINDS } from '../library/volumeKind';

/**
 * Compte Bento, créé par une invitation. Les comptes venus de Pocket ID
 * n'ont ni identifiant ni mot de passe tant qu'ils ne sont pas activés.
 */
export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Identifiant tel qu'affiché (« Léa »).
    name: text('name').notNull(),
    // Identifiant de connexion, en minuscules (« léa ») : unique.
    username: text('username').unique(),
    // scrypt, voir `auth/passwords.ts`.
    passwordHash: text('password_hash'),
    // Graine de l'avatar DiceBear « Clay ».
    avatarSeed: text('avatar_seed'),
    email: text('email'),
    role: text('role', { enum: ['admin', 'reader'] }).notNull(),
    // Âge maximal des séries visibles (contrôle parental) ; null = aucune limite.
    maxAge: integer('max_age'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
});

/** Bibliothèque : un dossier de tomes, déclaré dans la configuration. */
export const libraries = sqliteTable('libraries', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    path: text('path').notNull().unique(),
    type: text('type', { enum: ['manga', 'comics'] }).notNull(),
    lastScanAt: integer('last_scan_at', { mode: 'timestamp' }),
});

/**
 * Formats de série (manga, BD…), gérés par l'admin, chacun avec le mode
 * de lecture des séries qui n'en ont pas choisi.
 */
export const formats = sqliteTable('formats', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    readingMode: text('reading_mode', { enum: READING_MODES }).notNull(),
});

/** Série : un dossier de premier niveau de la bibliothèque. */
export const series = sqliteTable(
    'series',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        libraryId: integer('library_id')
            .notNull()
            .references(() => libraries.id, { onDelete: 'cascade' }),
        // Dossier de la série (ou nom, pour un tome rangé à la racine).
        key: text('key').notNull(),
        name: text('name').notNull(),
        // Métadonnées reprises du premier tome.
        summary: text('summary'),
        // Genres et thèmes bruts du premier tome (`Genre` et `Tags`), rangés
        // à la lecture d'après la liste des genres.
        genre: text('genre'),
        tags: text('tags'),
        ageRating: text('age_rating'),
        // Âge minimal pour la lire, déduit de la classification ; null = inconnu.
        minAge: integer('min_age'),
        // Couverture choisie (fichier covers/series-<id>.webp) : date de mise
        // à jour, pour les caches ; null = celle du premier tome.
        coverUpdatedAt: integer('cover_updated_at', { mode: 'timestamp_ms' }),
        // Parution de l'édition d'origine, choisie dans Bento (fiches en
        // ligne) : année de début, et de fin si la série est finie.
        startYear: integer('start_year'),
        endYear: integer('end_year'),
        year: integer('year'),
        count: integer('count'),
        // En cours de parution ou terminée, réglé dans Bento (pas dans les
        // tomes) ; null = inconnu.
        status: text('status', { enum: ['ongoing', 'completed'] }),
        // Mode de lecture choisi pour la série ; null = celui de la bibliothèque.
        readingMode: text('reading_mode', {
            enum: ['ltr', 'ltr-manga', 'rtl', 'webtoon'],
        }),
        // Format, réglé dans Bento ; null = pas encore choisi.
        formatId: integer('format_id').references(() => formats.id, {
            onDelete: 'set null',
        }),
        // Âge minimal choisi dans Bento (grille des réglages) ; null = celui
        // déduit de la classification des tomes (`minAge`).
        age: integer('age'),
        // Fiches en ligne choisies, séparées par une espace
        // (« manga-news:Dr-Stone wikipedia:123 », voir
        // `metadata/sourceLink.ts`) ; null = aucune.
        sources: text('source'),
        // Fiche qui donne le nombre de tomes parus (tomes manquants), choisie
        // par l'admin ; null = la plus proche des tomes de Bento.
        volumeCountSite: text('volume_count_site', {
            enum: ['manga-news', 'bedetheque'],
        }),
        writer: text('writer'),
        publisher: text('publisher'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (t) => [uniqueIndex('series_library_key').on(t.libraryId, t.key)],
);

/** Tome : une archive CBZ. */
export const volumes = sqliteTable(
    'volumes',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        libraryId: integer('library_id')
            .notNull()
            .references(() => libraries.id, { onDelete: 'cascade' }),
        seriesId: integer('series_id')
            .notNull()
            .references(() => series.id, { onDelete: 'cascade' }),
        // Chemin relatif à la bibliothèque, séparé par « / ».
        file: text('file').notNull(),
        number: text('number'),
        // Numéro en nombre, pour trier (« 12.5 » entre 12 et 13).
        sortNumber: real('sort_number'),
        // Groupement libre de tomes (« Part 1 - Rouge, Bleu et Jaune »,
        // « Guides » pour des hors-séries), numérotés à part dans leur
        // groupe : le ComicInfo (StoryArc) ou le nom du fichier ; et sa clé
        // de tri naturelle. Colonnes nommées `part` et `part_name` par leur
        // première version (migration 0033, déjà appliquée).
        group: text('part'),
        groupSort: text('part_name'),
        // Tome, hors-série ou spécial (`library/volumeKind.ts`) : chaque type
        // a sa numérotation, hors-séries et spéciaux viennent après les tomes.
        kind: text('kind', { enum: VOLUME_KINDS }).notNull().default('volume'),
        title: text('title'),
        // ComicInfo.xml complet du tome ({} s'il n'en a pas).
        comicInfo: text('comic_info', { mode: 'json' })
            .$type<ComicInfo>()
            .notNull(),
        pageCount: integer('page_count').notNull(),
        // Largeur et hauteur de chaque page, calculées à la première demande
        // (double page) ; null tant qu'elles ne l'ont pas été.
        pageSizes: text('page_sizes', { mode: 'json' }).$type<
            [number, number][]
        >(),
        size: integer('size').notNull(),
        // Date de modification du fichier : un tome inchangé n'est pas relu.
        mtimeMs: real('mtime_ms').notNull(),
        addedAt: integer('added_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (t) => [
        uniqueIndex('volumes_library_file').on(t.libraryId, t.file),
        index('volumes_series').on(t.seriesId),
    ],
);

/**
 * Lien envoyé par l'admin : invitation (nouveau compte, sans `userId`), ou
 * activation et nouveau mot de passe d'un compte. À usage unique.
 */
export const invitations = sqliteTable('invitations', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Empreinte SHA-256 du jeton du lien (jamais le jeton lui-même).
    tokenHash: text('token_hash').notNull().unique(),
    userId: integer('user_id').references(() => users.id, {
        onDelete: 'cascade',
    }),
    // Rôle et âge maximal du compte créé par une invitation.
    role: text('role', { enum: ['admin', 'reader'] })
        .notNull()
        .default('reader'),
    maxAge: integer('max_age'),
    // Identifiant proposé par l'admin (tel que tapé), modifiable à l'inscription.
    username: text('username'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

/** Session de connexion ; le cookie ne contient que son identifiant. */
export const sessions = sqliteTable(
    'sessions',
    {
        // Empreinte SHA-256 du jeton du cookie (jamais le jeton lui-même).
        id: text('id').primaryKey(),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    },
    (t) => [index('sessions_user').on(t.userId)],
);

/** Où en est chaque personne dans chaque tome. */
export const readProgress = sqliteTable(
    'read_progress',
    {
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        volumeId: integer('volume_id')
            .notNull()
            .references(() => volumes.id, { onDelete: 'cascade' }),
        // Dernière page atteinte (index à partir de 0).
        page: integer('page').notNull(),
        completed: integer('completed', { mode: 'boolean' }).notNull(),
        // À la milliseconde : ordre de « Reprendre la lecture ».
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.userId, t.volumeId] }),
        index('read_progress_recent').on(t.userId, t.updatedAt),
    ],
);

/**
 * Séances de lecture : temps passé dans le lecteur (Bento), ou repris de
 * Kavita à la migration. Pour les statistiques.
 */
export const readingSessions = sqliteTable(
    'reading_sessions',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        // Tome lu ; null s'il a disparu (ou introuvable à l'import).
        volumeId: integer('volume_id').references(() => volumes.id, {
            onDelete: 'set null',
        }),
        startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
        endedAt: integer('ended_at', { mode: 'timestamp_ms' }).notNull(),
        pages: integer('pages').notNull().default(0),
        source: text('source', { enum: ['bento', 'kavita'] })
            .notNull()
            .default('bento'),
        // Séance importée : son numéro d'origine (import relancé sans
        // doublon).
        externalId: text('external_id').unique(),
    },
    (t) => [index('reading_sessions_user').on(t.userId, t.startedAt)],
);

/**
 * Réglages choisis pour la série d'un dossier de brouillons (statut, mode
 * de lecture, couverture) : appliqués à la série à la publication (elle
 * n'existe pas encore en base). La table garde son nom d'origine.
 */
export const draftSettings = sqliteTable(
    'draft_statuses',
    {
        libraryId: integer('library_id')
            .notNull()
            .references(() => libraries.id, { onDelete: 'cascade' }),
        // Dossier relatif à la bibliothèque (« _draft/Gantz »).
        folder: text('folder').notNull(),
        status: text('status', { enum: ['ongoing', 'completed'] }),
        readingMode: text('reading_mode', {
            enum: ['ltr', 'ltr-manga', 'rtl', 'webtoon'],
        }),
        formatId: integer('format_id').references(() => formats.id, {
            onDelete: 'set null',
        }),
        age: integer('age'),
        sources: text('source'),
        startYear: integer('start_year'),
        endYear: integer('end_year'),
        // Couverture choisie (fichier covers/drafts/…) ; null = aucune.
        coverUpdatedAt: integer('cover_updated_at', { mode: 'timestamp_ms' }),
    },
    (t) => [primaryKey({ columns: [t.libraryId, t.folder] })],
);

/** Listes personnelles : favoris et « à lire », par personne. */
export const seriesLists = sqliteTable(
    'series_lists',
    {
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        seriesId: integer('series_id')
            .notNull()
            .references(() => series.id, { onDelete: 'cascade' }),
        list: text('list', { enum: ['favorite', 'toread'] }).notNull(),
        addedAt: integer('added_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (t) => [
        primaryKey({ columns: [t.userId, t.seriesId, t.list] }),
        index('series_lists_series').on(t.seriesId),
    ],
);

/**
 * Collections partagées (« Pour les enfants »), retirées de Bento le
 * 6 novembre 2026 : les tables restent en base, inutilisées.
 */
export const collections = sqliteTable(
    'collections',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        name: text('name').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (t) => [uniqueIndex('collections_name').on(t.name)],
);

export const collectionSeries = sqliteTable(
    'collection_series',
    {
        collectionId: integer('collection_id')
            .notNull()
            .references(() => collections.id, { onDelete: 'cascade' }),
        seriesId: integer('series_id')
            .notNull()
            .references(() => series.id, { onDelete: 'cascade' }),
        addedAt: integer('added_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (t) => [
        primaryKey({ columns: [t.collectionId, t.seriesId] }),
        index('collection_series_series').on(t.seriesId),
    ],
);

/**
 * Liste des genres, gérée par l'admin. Les alias sont les autres noms
 * reconnus dans les fichiers (« Humour » pour « Comédie »).
 */
export const genres = sqliteTable('genres', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    aliases: text('aliases', { mode: 'json' })
        .$type<string[]>()
        .notNull()
        .default(sql`'[]'`),
});

/**
 * Notes des lecteurs relevées sur les fiches en ligne (Manga-news,
 * Bedetheque), une par fiche : gardées à chaque lecture de la fiche, elles
 * suivent les séries liées à cette fiche (et ses brouillons). Sur 5.
 */
export const sourceRatings = sqliteTable(
    'source_ratings',
    {
        site: text('site').notNull(),
        sourceId: text('source_id').notNull(),
        value: real('value').notNull(),
        count: integer('count').notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.site, t.sourceId] })],
);

/**
 * Fiches en ligne lues : date de la dernière lecture, valeurs principales
 * telles que l'admin les a vues (ou à la première lecture), et ce qui a
 * changé depuis d'après la mise à jour de nuit (« Fiche à revoir »).
 */
export const sourceSheets = sqliteTable(
    'source_sheets',
    {
        site: text('site').notNull(),
        sourceId: text('source_id').notNull(),
        checkedAt: integer('checked_at', { mode: 'timestamp_ms' }).notNull(),
        snapshot: text('snapshot', { mode: 'json' })
            .$type<Record<string, string | number | boolean | null>>()
            .notNull(),
        changes: text('changes', { mode: 'json' }).$type<string[]>(),
        // Tomes parus d'après la dernière lecture (tomes manquants).
        volumeCount: integer('volume_count'),
    },
    (t) => [primaryKey({ columns: [t.site, t.sourceId] })],
);

/**
 * Recherche de nuit d'une fiche manquante (Manga-news, Bedetheque) pour une
 * série : le nom cherché (une autre recherche s'il change) et ses écritures
 * déjà essayées (« et », « & »).
 */
export const sheetSearches = sqliteTable(
    'sheet_searches',
    {
        seriesId: integer('series_id')
            .notNull()
            .references(() => series.id, { onDelete: 'cascade' }),
        site: text('site').notNull(),
        name: text('name').notNull(),
        tried: text('tried', { mode: 'json' }).$type<string[]>().notNull(),
        searchedAt: integer('searched_at', { mode: 'timestamp_ms' }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.seriesId, t.site] })],
);

/**
 * Fiche trouvée pour une série, à lier par l'admin : « pending » (à lire),
 * « proposed » (montrée dans Séries), « refused » (jamais reproposée).
 */
export const sheetProposals = sqliteTable(
    'sheet_proposals',
    {
        seriesId: integer('series_id')
            .notNull()
            .references(() => series.id, { onDelete: 'cascade' }),
        site: text('site').notNull(),
        sourceId: text('source_id').notNull(),
        title: text('title').notNull(),
        status: text('status', {
            enum: ['pending', 'proposed', 'refused'],
        }).notNull(),
        // Ce que la fiche dit (auteurs, tomes, année), pour juger.
        details: text('details', { mode: 'json' }).$type<
            Record<string, string | number | boolean | null>
        >(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.seriesId, t.site, t.sourceId] })],
);

/** Réglages de l'admin (clé → valeur JSON). */
export const settings = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value', { mode: 'json' }).notNull(),
});
