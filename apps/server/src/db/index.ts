import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import * as schema from './schema';

// `apps/server/drizzle`, depuis `src/db` (dev) comme depuis `dist/db` (build).
const MIGRATIONS_FOLDER = path.join(__dirname, '../../drizzle');

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Ouvre la base SQLite (`:memory:` pour les tests) et applique les
 * migrations manquantes.
 */
export const openDatabase = (file: string) => {
    if (file !== ':memory:') {
        mkdirSync(path.dirname(file), { recursive: true });
    }
    const sqlite = new Database(file);
    // WAL : lectures pendant les écritures (scan pendant la lecture).
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return { db, close: () => sqlite.close() };
};
