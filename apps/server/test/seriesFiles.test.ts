import { eq } from 'drizzle-orm';
import { access, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { readingSessions, series, users, volumes } from '../src/db/schema';
import { setSeriesLists } from '../src/library/lists';
import { getProgress, saveProgress } from '../src/library/progress';
import { addReadingTime } from '../src/library/readingTime';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;

const exists = (relative: string) =>
    access(ctx.file(relative)).then(
        () => true,
        () => false,
    );

const call = async (
    path: string,
    init: { method?: string; json?: unknown } = {},
) => {
    const response = await api.request(path, {
        method: init.method ?? 'GET',
        headers: {
            Cookie: admin,
            ...(init.json !== undefined && {
                'Content-Type': 'application/json',
            }),
        },
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
    return { status: response.status, body: await response.json() };
};

const info = (number: string) =>
    `<Series>Gantz</Series><Number>${number}</Number>`;

/** Série Gantz publiée, deux tomes, rangée par le scan. */
const publishedGantz = async () => {
    await writeCbz(ctx.file('Gantz/Gantz #01.cbz'), { comicInfo: info('1') });
    await writeCbz(ctx.file('Gantz/Gantz #02.cbz'), { comicInfo: info('2') });
    await ctx.scanner.scan(ctx.library.id);
    const gantz = ctx.db.select().from(series).get()!;
    const [first, second] = ctx.db
        .select()
        .from(volumes)
        .orderBy(volumes.file)
        .all();
    return { gantz, first: first!, second: second! };
};

const readerId = () =>
    ctx.db
        .insert(users)
        .values({ name: 'Lou', username: 'lou', role: 'reader' })
        .returning({ id: users.id })
        .get().id;

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
    admin = sessionCookie(ctx.db, 'admin');
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('archived drafts', () => {
    it('are listed as such and no longer pending', async () => {
        await writeCbz(ctx.file('_draft/Gantz/Gantz T01.cbz'));
        await writeCbz(ctx.file('_draft/Spirale.cbz'));
        expect(await ctx.files.pendingSeries()).toBe(2);

        const archived = await call(
            `/libraries/${ctx.library.id}/drafts/archive`,
            {
                method: 'PUT',
                json: { folder: '_draft/Gantz', archived: true },
            },
        );
        expect(archived.status).toBe(200);

        expect(await ctx.files.pendingSeries()).toBe(1);
        const drafts = await ctx.files.drafts(ctx.library.id);
        expect(
            drafts.find((d) => d.folder === '_draft/Gantz')!.archivedAt,
        ).not.toBeNull();
        expect(
            drafts.find((d) => d.folder === '_draft/Spirale.cbz')!.archivedAt,
        ).toBeNull();

        // Et de nouveau en attente.
        await call(`/libraries/${ctx.library.id}/drafts/archive`, {
            method: 'PUT',
            json: { folder: '_draft/Gantz', archived: false },
        });
        expect(await ctx.files.pendingSeries()).toBe(2);
    });
});

describe('a draft deleted from the disk', () => {
    it('loses its volumes and the other files of its folder, not a nested draft', async () => {
        await writeCbz(ctx.file('_draft/Gantz/Gantz T01.cbz'));
        await writeCbz(ctx.file('_draft/Gantz/Gantz T02.cbz'));
        await writeFile(ctx.file('_draft/Gantz/release.nfo'), 'scantrad');
        await writeCbz(ctx.file('_draft/Gantz/Bonus/Bonus T01.cbz'));
        await writeCbz(ctx.file('_draft/Spirale.cbz'));
        ctx.files.archiveDraft(ctx.library.id, '_draft/Gantz', true);

        const { status, body } = await call(
            `/libraries/${ctx.library.id}/drafts?folder=${encodeURIComponent('_draft/Gantz')}`,
            { method: 'DELETE' },
        );

        expect(status).toBe(200);
        expect(body).toEqual({ deleted: 2 });
        expect(await exists('_draft/Gantz/Gantz T01.cbz')).toBe(false);
        expect(await exists('_draft/Gantz/release.nfo')).toBe(false);
        expect(await exists('_draft/Gantz/Bonus/Bonus T01.cbz')).toBe(true);
        expect(
            (await ctx.files.drafts(ctx.library.id)).map((d) => d.folder),
        ).toEqual(['_draft/Gantz/Bonus', '_draft/Spirale.cbz']);
    });

    it('can be a lone volume at the root of _draft, and its folder empties', async () => {
        await writeCbz(ctx.file('_draft/Spirale.cbz'));
        await writeCbz(ctx.file('_draft/Solo/Solo T01.cbz'));

        await call(
            `/libraries/${ctx.library.id}/drafts?folder=${encodeURIComponent('_draft/Spirale.cbz')}`,
            { method: 'DELETE' },
        );
        await call(
            `/libraries/${ctx.library.id}/drafts?folder=${encodeURIComponent('_draft/Solo')}`,
            { method: 'DELETE' },
        );

        expect(await exists('_draft/Spirale.cbz')).toBe(false);
        expect(await exists('_draft/Solo')).toBe(false);
        expect(await ctx.files.drafts(ctx.library.id)).toEqual([]);
    });

    it('never leaves _draft', async () => {
        await writeCbz(ctx.file('Gantz/Gantz #01.cbz'));
        const { status } = await call(
            `/libraries/${ctx.library.id}/drafts?folder=${encodeURIComponent('_draft/../Gantz')}`,
            { method: 'DELETE' },
        );
        expect(status).toBe(404);
        expect(await exists('Gantz/Gantz #01.cbz')).toBe(true);
    });
});

describe('a series deleted from the disk', () => {
    it('loses its files and disappears, its reading time stays in the stats', async () => {
        const { gantz, first } = await publishedGantz();
        const lou = readerId();
        addReadingTime(ctx.db, lou, first.id, { seconds: 120, pages: 4 });

        const { status, body } = await call(`/series/${gantz.id}/files`, {
            method: 'DELETE',
        });

        expect(status).toBe(200);
        expect(body).toEqual({ deleted: 2, failures: [] });
        expect(await exists('Gantz/Gantz #01.cbz')).toBe(false);
        // Le dossier vidé part avec.
        expect(await exists('Gantz')).toBe(false);
        expect(ctx.db.select().from(series).all()).toEqual([]);
        expect(ctx.db.select().from(readingSessions).all()).toEqual([
            expect.objectContaining({ userId: lou, volumeId: null }),
        ]);
    });

    it('is refused to a reader', async () => {
        const { gantz } = await publishedGantz();
        admin = sessionCookie(ctx.db, 'reader');
        const { status } = await call(`/series/${gantz.id}/files`, {
            method: 'DELETE',
        });
        expect(status).toBe(403);
        expect(await exists('Gantz/Gantz #01.cbz')).toBe(true);
    });
});

describe('a series put back in the drafts', () => {
    it('moves its files to _draft with its settings, then gets its readings back when published', async () => {
        const { gantz, first, second } = await publishedGantz();
        ctx.db
            .update(series)
            .set({ status: 'completed', formatId: 1, age: 16, startYear: 2000 })
            .where(eq(series.id, gantz.id))
            .run();
        const lou = readerId();
        saveProgress(ctx.db, lou, first.id, { completed: true });
        saveProgress(ctx.db, lou, second.id, { page: 1 });
        addReadingTime(ctx.db, lou, second.id, { seconds: 60, pages: 1 });
        setSeriesLists(
            ctx.db,
            { id: lou, role: 'reader', maxAge: null },
            gantz.id,
            { toRead: true },
        );

        const { status, body } = await call(`/series/${gantz.id}/draft`, {
            method: 'POST',
        });

        expect(status).toBe(200);
        expect(body).toEqual({
            libraryId: ctx.library.id,
            folder: '_draft/Gantz',
        });
        expect(await exists('_draft/Gantz/Gantz #01.cbz')).toBe(true);
        expect(await exists('Gantz')).toBe(false);
        expect(ctx.db.select().from(series).all()).toEqual([]);
        const [draft] = await ctx.files.drafts(ctx.library.id);
        expect(draft).toMatchObject({
            folder: '_draft/Gantz',
            status: 'completed',
            formatId: 1,
            age: 16,
            startYear: 2000,
        });
        // Ce qui est gardé de côté n'est pas envoyé au client.
        expect(draft).not.toHaveProperty('kept');

        await ctx.files.publish(ctx.library.id, [
            '_draft/Gantz/Gantz #01.cbz',
            '_draft/Gantz/Gantz #02.cbz',
        ]);

        const back = ctx.db.select().from(series).get()!;
        expect(back).toMatchObject({
            name: 'Gantz',
            status: 'completed',
            age: 16,
        });
        const [one, two] = ctx.db
            .select()
            .from(volumes)
            .orderBy(volumes.file)
            .all();
        expect(getProgress(ctx.db, lou, one!.id)).toMatchObject({
            completed: true,
        });
        expect(getProgress(ctx.db, lou, two!.id)).toMatchObject({ page: 1 });
        expect(ctx.db.select().from(readingSessions).all()).toEqual([
            expect.objectContaining({ volumeId: two!.id }),
        ]);
        expect(
            setSeriesLists(
                ctx.db,
                { id: lou, role: 'reader', maxAge: null },
                back.id,
                {},
            ),
        ).toEqual({ toRead: true, notForMe: false, rereading: false });
        // Dossier publié en entier : plus de réglages en attente.
        expect(await ctx.files.drafts(ctx.library.id)).toEqual([]);
    });

    it('never mixes with a draft folder of the same name', async () => {
        const { gantz } = await publishedGantz();
        await writeCbz(ctx.file('_draft/Gantz/autre.cbz'));

        const { body } = await call(`/series/${gantz.id}/draft`, {
            method: 'POST',
        });

        expect(body.folder).toBe('_draft/Gantz (2)');
        expect(await exists('_draft/Gantz (2)/Gantz #02.cbz')).toBe(true);
        expect(await exists('_draft/Gantz/autre.cbz')).toBe(true);
    });
});
