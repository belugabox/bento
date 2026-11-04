import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Compte Bento, créé à la première connexion via Pocket ID. */
export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Identifiant stable de la personne chez Pocket ID (claim `sub`).
    oidcSubject: text('oidc_subject').notNull().unique(),
    name: text('name').notNull(),
    email: text('email'),
    role: text('role', { enum: ['admin', 'reader'] }).notNull(),
    // Classification d'âge maximale (AgeRating du ComicInfo) ; null = aucune limite.
    maxAgeRating: text('max_age_rating'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
});
