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

/** Compte Bento, créé à la première connexion via Pocket ID. */
export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Identifiant stable de la personne chez Pocket ID (claim `sub`).
    oidcSubject: text('oidc_subject').notNull().unique(),
    name: text('name').notNull(),
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
        genre: text('genre'),
        ageRating: text('age_rating'),
        // Âge minimal pour la lire, déduit de la classification ; null = inconnu.
        minAge: integer('min_age'),
        // Couverture choisie (fichier covers/series-<id>.webp) : date de mise
        // à jour, pour les caches ; null = celle du premier tome.
        coverUpdatedAt: integer('cover_updated_at', { mode: 'timestamp_ms' }),
        year: integer('year'),
        count: integer('count'),
        // En cours de parution ou terminée, réglé dans Bento (pas dans les
        // tomes) ; null = inconnu.
        status: text('status', { enum: ['ongoing', 'completed'] }),
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
 * Statut choisi pour la série d'un dossier de brouillons : appliqué à la
 * série à la publication (la série n'existe pas encore en base).
 */
export const draftStatuses = sqliteTable(
    'draft_statuses',
    {
        libraryId: integer('library_id')
            .notNull()
            .references(() => libraries.id, { onDelete: 'cascade' }),
        // Dossier relatif à la bibliothèque (« _draft/Gantz »).
        folder: text('folder').notNull(),
        status: text('status', { enum: ['ongoing', 'completed'] }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.libraryId, t.folder] })],
);
