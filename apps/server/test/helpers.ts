import AdmZip from 'adm-zip';
import { eq } from 'drizzle-orm';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pino } from 'pino';
import sharp from 'sharp';

import { PageReader } from '../src/archive/archive';
import { type Role, createSession } from '../src/auth/sessions';
import type { Db } from '../src/db';
import { openDatabase } from '../src/db';
import { users } from '../src/db/schema';
import { syncLibraries } from '../src/library/catalog';
import { SeriesCovers } from '../src/library/covers';
import { LibraryFiles } from '../src/library/files';
import { LibraryScanner } from '../src/library/scanner';
import { Wikipedia } from '../src/metadata/wikipedia';

export const silent = pino({ level: 'silent' });

/** Petite image PNG unie (vraie image : sharp doit pouvoir la lire). */
export const png = (color: string) =>
    sharp({
        create: { width: 20, height: 30, channels: 3, background: color },
    })
        .png()
        .toBuffer();

/** Écrit un CBZ : pages nommées, ComicInfo optionnel. */
export const writeCbz = async (
    fullPath: string,
    { pages = 2, comicInfo }: { pages?: number; comicInfo?: string } = {},
) => {
    const zip = new AdmZip();
    for (let i = 1; i <= pages; i++) {
        zip.addFile(`p${i}.png`, await png(i % 2 ? '#ff0000' : '#0000ff'));
    }
    if (comicInfo) {
        zip.addFile(
            'ComicInfo.xml',
            Buffer.from(
                `<?xml version="1.0"?><ComicInfo>${comicInfo}</ComicInfo>`,
            ),
        );
    }
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, zip.toBuffer());
};

/** Bibliothèque temporaire, base en mémoire et scanner prêts à l'emploi. */
export const setup = async (type: 'manga' | 'comics' = 'manga') => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bento-'));
    const root = path.join(dir, 'library');
    const coversPath = path.join(dir, 'covers');
    await mkdir(root, { recursive: true });
    const database = openDatabase(':memory:');
    const [library] = await syncLibraries(
        database.db,
        [{ name: 'Mangas', path: root, type }],
        coversPath,
    );
    const scanner = new LibraryScanner(database.db, coversPath, silent);
    const pages = new PageReader();
    return {
        db: database.db,
        root,
        coversPath,
        library: library!,
        scanner,
        pages,
        files: new LibraryFiles(
            database.db,
            scanner,
            pages,
            coversPath,
            silent,
        ),
        covers: new SeriesCovers(database.db, pages, coversPath),
        // Pas de réseau dans les tests : toute requête échoue.
        wikipedia: new Wikipedia(() => Promise.reject(new Error('hors ligne'))),
        file: (relative: string) => path.join(root, ...relative.split('/')),
        cleanup: async () => {
            database.close();
            await rm(dir, { recursive: true, force: true });
        },
    };
};

/**
 * Un format pour chaque dossier de brouillons : obligatoire pour publier
 * (sauf vers une série qui en a déjà un).
 */
export const formatDrafts = async (ctx: Awaited<ReturnType<typeof setup>>) => {
    for (const draft of await ctx.files.drafts(ctx.library.id)) {
        ctx.files.setDraftSettings(ctx.library.id, draft.folder, {
            formatId: 1,
        });
    }
};

/**
 * Cookie d'une session ouverte pour une personne de ce rôle ; `username`
 * retrouve le compte (créé s'il n'existe pas).
 */
export const sessionCookie = (db: Db, role: Role, username = `${role}-sub`) => {
    const existing = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .get();
    const id =
        existing?.id ??
        db
            .insert(users)
            .values({ name: role, username, role })
            .returning({ id: users.id })
            .get().id;
    if (existing) db.update(users).set({ role }).where(eq(users.id, id)).run();
    return `bento_session=${createSession(db, id)}`;
};

/** Dépendances de connexion pour `createApi`. */
export const authDeps = () => ({ publicUrl: PUBLIC_URL });

export const PUBLIC_URL = 'http://localhost:5173';
