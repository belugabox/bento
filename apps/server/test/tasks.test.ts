import { readFile, stat, utimes } from 'node:fs/promises';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { listSeries } from '../src/library/catalog';
import { coverFile } from '../src/library/scanner';
import { smallCoverFile } from '../src/library/smallCovers';
import { TaskList } from '../src/tasks';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;

const ADMIN_VIEW = { id: 0, role: 'admin' as const, maxAge: null };

const call = (path: string, role: 'admin' | 'reader' = 'admin') =>
    api.request(path, { headers: { Cookie: sessionCookie(ctx.db, role) } });

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
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('TaskList', () => {
    it('lists running tasks with their progress, until they finish', async () => {
        const tasks = new TaskList();
        const scan = tasks.start('Scan de « Mangas »');
        scan.progress(3, 10);
        const result = tasks.run('Publication', async () => {
            expect(tasks.list().map((t) => t.label)).toEqual([
                'Scan de « Mangas »',
                'Publication',
            ]);
            return 42;
        });

        expect(await result).toBe(42);
        expect(tasks.list()).toEqual([
            expect.objectContaining({
                label: 'Scan de « Mangas »',
                done: 3,
                total: 10,
            }),
        ]);
        scan.finish();
        expect(tasks.list()).toEqual([]);
    });
});

describe('tasks', () => {
    it('shows a scan in progress to admins only', async () => {
        await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));
        const scan = ctx.scanner.scan(ctx.library.id);

        const running = await (await call('/tasks')).json();
        expect(running).toEqual([
            expect.objectContaining({ label: 'Scan de « Mangas »' }),
        ]);
        expect((await call('/tasks', 'reader')).status).toBe(403);

        await scan;
        expect(await (await call('/tasks')).json()).toEqual([]);
    });
});

describe('small covers', () => {
    it('are made on first request, kept, and redone when the cover changes', async () => {
        await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));
        await ctx.scanner.scan(ctx.library.id);
        const [series] = listSeries(ctx.db, ADMIN_VIEW);
        const cover = coverFile(ctx.coversPath, series!.coverVolumeId!);
        const small = smallCoverFile(cover);

        const response = await call(
            `/volumes/${series!.coverVolumeId}/cover?size=small`,
        );

        expect(response.status).toBe(200);
        const { width, height } = await sharp(
            Buffer.from(await response.arrayBuffer()),
        ).metadata();
        expect([width, height]).toEqual([200, 300]);
        const made = await stat(small);
        // La série sert la même version réduite.
        expect(
            (await call(`/series/${series!.id}/cover?size=small`)).status,
        ).toBe(200);
        expect((await stat(small)).mtimeMs).toBe(made.mtimeMs);

        // Couverture plus récente : version réduite refaite.
        const later = new Date(Date.now() + 60_000);
        await utimes(cover, later, later);
        await call(`/volumes/${series!.coverVolumeId}/cover?size=small`);
        expect((await stat(small)).mtimeMs).toBeGreaterThan(made.mtimeMs);
        // Sans `size`, la couverture entière.
        const full = await call(`/volumes/${series!.coverVolumeId}/cover`);
        expect(Buffer.from(await full.arrayBuffer())).toEqual(
            await readFile(cover),
        );
    });
});
