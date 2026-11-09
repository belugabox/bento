import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import {
    readProgress,
    readingSessions,
    seriesLists,
    users,
    volumes,
} from '../src/db/schema';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;
let naruto: { id: number; file: string; addedAt: Date }[];

const ROOT = '/RED/Books/Manga';

/** Petite base de Kavita : les tables et colonnes lues par l'import. */
const kavitaDb = (file: string) => {
    const k = new Database(file);
    k.exec(`
        create table AspNetUsers (Id integer primary key, UserName text, AgeRestriction integer);
        create table Library (Id integer primary key, Name text, Type integer);
        create table FolderPath (Id integer primary key, LibraryId integer, Path text);
        create table Series (Id integer primary key, LibraryId integer, Name text);
        create table Volume (Id integer primary key, SeriesId integer);
        create table Chapter (Id integer primary key, VolumeId integer, Pages integer, CreatedUtc text);
        create table MangaFile (Id integer primary key, ChapterId integer, FilePath text, CreatedUtc text);
        create table AppUserProgresses (Id integer primary key, AppUserId integer, ChapterId integer, SeriesId integer, PagesRead integer, LastModifiedUtc text);
        create table AppUserWantToRead (Id integer primary key, AppUserId integer, SeriesId integer);
        create table AppUserReadingSession (Id integer primary key, AppUserId integer, StartTimeUtc text, EndTimeUtc text);
        create table AppUserReadingSessionActivityData (Id integer primary key, AppUserReadingSessionId integer, ChapterId integer, LibraryId integer, PagesRead integer);

        insert into AspNetUsers values (1, 'Ben', -1), (2, 'Léa', 5), (3, 'Zoé', -1);
        insert into Library values (1, 'Manga', 1), (2, 'Draft', 1), (3, 'Books', 2);
        insert into FolderPath values (1, 1, '${ROOT}'), (2, 2, '${ROOT}/_draft'), (3, 3, '/RED/Books/Books');
        insert into Series values (10, 1, 'Naruto');
        insert into Volume values (20, 10);
    `);
    naruto.forEach((volume, index) => {
        const chapter = 30 + index;
        k.prepare('insert into Chapter values (?, 20, 3, ?)').run(
            chapter,
            '2025-03-28 15:48:58.5326832',
        );
        k.prepare('insert into MangaFile values (?, ?, ?, ?)').run(
            chapter,
            chapter,
            `${ROOT}/${volume.file}`,
            '2026-11-09 00:00:09.3637625',
        );
    });
    k.exec(`
        -- Léa : T1 fini, 2 pages du T2 ; un fichier inconnu de Bento.
        insert into Chapter values (99, 20, 3, '2025-03-28 15:48:58');
        insert into MangaFile values (99, 99, '${ROOT}/Naruto/Disparu.cbz', '2025-03-28 15:48:58');
        insert into AppUserProgresses values
            (1, 2, 30, 10, 3, '2026-01-02 10:00:00.0000000'),
            (2, 2, 31, 10, 2, '2026-01-03 10:00:00.0000000'),
            (3, 2, 99, 10, 3, '2026-01-03 10:00:00.0000000'),
            (4, 3, 30, 10, 0, '2026-01-03 10:00:00.0000000');
        insert into AppUserWantToRead values (1, 2, 10);
        -- Une séance mesurée (30 min), une estimée (minuit pile, 1 h).
        insert into AppUserReadingSession values
            (1, 2, '2026-01-02 09:30:00.0000000', '2026-01-02 10:00:00.0000000'),
            (2, 2, '2025-04-01 00:00:00', '2025-04-01 01:00:00.0000000');
        insert into AppUserReadingSessionActivityData values (1, 1, 30, 1, 3);
    `);
    k.close();
};

beforeEach(async () => {
    ctx = await setup();
    api = createApi({
        db: ctx.db,
        logger: silent,
        version: '1.0.0',
        scanner: ctx.scanner,
        pages: ctx.pages,
        coversPath: ctx.coversPath,
        files: ctx.files,
        covers: ctx.covers,
        wikipedia: ctx.wikipedia,
        auth: authDeps(),
    });
    admin = sessionCookie(ctx.db, 'admin', 'ben');
    ctx.db.update(users).set({ name: 'Ben' }).run();
    for (const n of [1, 2]) {
        await writeCbz(ctx.file(`Naruto/Naruto #0${n} (2002).cbz`), {
            pages: 3,
        });
    }
    await ctx.scanner.scan(ctx.library.id);
    naruto = ctx.db
        .select({
            id: volumes.id,
            file: volumes.file,
            addedAt: volumes.addedAt,
        })
        .from(volumes)
        .orderBy(volumes.file)
        .all()
        .map((v) => ({ ...v, file: v.file.replace(/\\/g, '/') }));
});

afterEach(async () => {
    await ctx.cleanup();
});

const upload = async (cookie = admin, names = ['kavita.db']) => {
    const file = path.join(ctx.coversPath, '..', 'source-kavita.db');
    if (!existsSync(file)) kavitaDb(file);
    const form = new FormData();
    for (const name of names) {
        form.append('files', new File([await readFile(file)], name));
    }
    return api.request('/migration/kavita', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: form,
    });
};

const apply = (body: unknown) =>
    api.request('/migration/kavita/apply', {
        method: 'POST',
        headers: { Cookie: admin, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

describe('Kavita migration', () => {
    it('analyses the uploaded database', async () => {
        const response = await upload();
        expect(response.status).toBe(200);
        const { analysis } = (await response.json()) as {
            analysis: {
                accounts: Record<string, unknown>[];
                files: { total: number; matched: number; unmatched: string[] };
                olderDates: number;
            };
        };
        expect(analysis.files).toEqual({
            total: 3,
            matched: 2,
            unmatched: ['Naruto/Disparu.cbz'],
        });
        expect(analysis.olderDates).toBe(2);
        expect(analysis.accounts).toEqual([
            expect.objectContaining({
                name: 'Ben',
                suggestedUserId: expect.any(Number),
            }),
            expect.objectContaining({
                name: 'Léa',
                maxAge: 10,
                completed: 2,
                inProgress: 1,
                matched: 2,
                wantToRead: 1,
                sessions: {
                    measured: 1,
                    measuredHours: 0.5,
                    estimated: 1,
                    estimatedHours: 1,
                },
                suggestedUserId: null,
            }),
            expect.objectContaining({ name: 'Zoé', completed: 0 }),
        ]);
        // Toujours là au retour sur la page.
        const again = await api.request('/migration/kavita', {
            headers: { Cookie: admin },
        });
        expect(
            ((await again.json()) as { analysis: unknown }).analysis,
        ).not.toBeNull();
    });

    it('refuses other files and non-admins', async () => {
        expect((await upload(admin, ['autre.txt'])).status).toBe(400);
        const reader = sessionCookie(ctx.db, 'reader', 'reader');
        expect((await upload(reader)).status).toBe(403);
    });

    it('creates the accounts, then imports reading, lists, dates and time', async () => {
        await upload();
        const response = await apply({
            accounts: [
                { kavitaId: 1, action: 'skip' },
                { kavitaId: 2, action: 'create', name: 'Léa', maxAge: 10 },
                { kavitaId: 3, action: 'skip' },
            ],
            addedDates: true,
            readingTime: true,
            estimatedSessions: false,
        });
        expect(await response.json()).toEqual({
            accountsCreated: 1,
            progress: 2,
            progressKept: 0,
            toRead: 1,
            addedDates: 2,
            sessions: 1,
        });

        const lea = ctx.db
            .select()
            .from(users)
            .where(eq(users.name, 'Léa'))
            .get()!;
        // À activer : ni identifiant ni mot de passe.
        expect(lea).toMatchObject({
            role: 'reader',
            maxAge: 10,
            username: null,
            passwordHash: null,
        });
        const progress = ctx.db
            .select()
            .from(readProgress)
            .where(eq(readProgress.userId, lea.id))
            .orderBy(readProgress.volumeId)
            .all();
        expect(progress.map((p) => [p.page, p.completed])).toEqual([
            [2, true],
            [1, false],
        ]);
        expect(progress[1]!.updatedAt.toISOString()).toBe(
            '2026-01-03T10:00:00.000Z',
        );
        expect(
            ctx.db
                .select()
                .from(seriesLists)
                .where(eq(seriesLists.userId, lea.id))
                .all(),
        ).toHaveLength(1);
        // Date d'ajout : la plus ancienne (Kavita, mars 2025).
        const added = ctx.db
            .select({ addedAt: volumes.addedAt })
            .from(volumes)
            .all();
        expect(added.every((v) => v.addedAt.getFullYear() === 2025)).toBe(true);
        // Seule la séance mesurée : 30 min, sur le T1.
        const [session] = ctx.db.select().from(readingSessions).all();
        expect(session).toMatchObject({
            userId: lea.id,
            volumeId: naruto[0]!.id,
            pages: 3,
            source: 'kavita',
        });
        expect(session!.endedAt.getTime() - session!.startedAt.getTime()).toBe(
            30 * 60 * 1000,
        );

        // Relancée (Léa associée cette fois), avec les séances estimées.
        const again = await apply({
            accounts: [{ kavitaId: 2, action: 'link', userId: lea.id }],
            addedDates: true,
            readingTime: true,
            estimatedSessions: true,
        });
        expect(await again.json()).toMatchObject({
            accountsCreated: 0,
            progress: 0,
            progressKept: 2,
            toRead: 0,
            addedDates: 0,
            sessions: 1,
        });
    });

    it('keeps a more recent reading done in Bento', async () => {
        await upload();
        const ben = ctx.db
            .select()
            .from(users)
            .where(eq(users.name, 'Ben'))
            .get()!;
        ctx.db
            .insert(readProgress)
            .values({
                userId: ben.id,
                volumeId: naruto[0]!.id,
                page: 0,
                completed: false,
                updatedAt: new Date('2026-11-01T00:00:00Z'),
            })
            .run();
        // Léa associée à Ben, pour l'essai.
        const response = await apply({
            accounts: [{ kavitaId: 2, action: 'link', userId: ben.id }],
            addedDates: false,
            readingTime: false,
            estimatedSessions: false,
        });
        expect(await response.json()).toMatchObject({
            progress: 1,
            progressKept: 1,
            addedDates: 0,
            sessions: 0,
        });
        expect(
            ctx.db
                .select({ page: readProgress.page })
                .from(readProgress)
                .where(eq(readProgress.volumeId, naruto[0]!.id))
                .get(),
        ).toEqual({ page: 0 });
    });

    it('forgets the uploaded files', async () => {
        await upload();
        await api.request('/migration/kavita', {
            method: 'DELETE',
            headers: { Cookie: admin },
        });
        const response = await api.request('/migration/kavita', {
            headers: { Cookie: admin },
        });
        expect(await response.json()).toEqual({ analysis: null });
        expect(
            (
                await apply({
                    accounts: [],
                    addedDates: true,
                    readingTime: true,
                    estimatedSessions: false,
                })
            ).status,
        ).toBe(400);
    });
});

describe('reading time', () => {
    it('adds the time spent in the reader, by sessions', async () => {
        const send = (seconds: number) =>
            api.request(`/volumes/${naruto[0]!.id}/reading-time`, {
                method: 'POST',
                headers: { Cookie: admin, 'Content-Type': 'application/json' },
                body: JSON.stringify({ seconds, pages: 2 }),
            });
        expect((await send(60)).status).toBe(200);
        await send(30);
        const sessions = ctx.db.select().from(readingSessions).all();
        expect(sessions).toHaveLength(1);
        expect(
            sessions[0]!.endedAt.getTime() - sessions[0]!.startedAt.getTime(),
        ).toBe(90_000);
        expect(sessions[0]!.pages).toBe(4);
        expect((await send(0)).status).toBe(400);

        const stats = (await (
            await api.request('/stats', { headers: { Cookie: admin } })
        ).json()) as { readers: { readingSeconds: number }[] };
        expect(stats.readers[0]!.readingSeconds).toBe(90);
    });
});
