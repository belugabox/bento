import AdmZip from 'adm-zip';
import { eq } from 'drizzle-orm';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { users, volumes } from '../src/db/schema';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let reader: string;

const image = (width: number, height: number) =>
    sharp({
        create: { width, height, channels: 3, background: '#808080' },
    })
        .png()
        .toBuffer();

/** Tome : couverture, page simple, double page déjà fusionnée. */
const writeVolume = async (relative: string) => {
    const zip = new AdmZip();
    zip.addFile('p1.png', await image(20, 30));
    zip.addFile('p2.png', await image(20, 30));
    zip.addFile('p3.png', await image(40, 30));
    const fullPath = ctx.file(relative);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, zip.toBuffer());
};

const sizes = async (volumeId: number, cookie = reader) => {
    const response = await api.request(`/volumes/${volumeId}/page-sizes`, {
        headers: { Cookie: cookie },
    });
    return { status: response.status, body: await response.json() };
};

const stored = (volumeId: number) =>
    ctx.db
        .select({ pageSizes: volumes.pageSizes })
        .from(volumes)
        .where(eq(volumes.id, volumeId))
        .get()?.pageSizes;

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
    reader = sessionCookie(ctx.db, 'reader');
    await writeVolume('Gantz/Gantz T01.cbz');
    await ctx.scanner.scan(ctx.library.id);
});

afterEach(async () => {
    await ctx.cleanup();
});

const firstVolumeId = () =>
    ctx.db.select({ id: volumes.id }).from(volumes).get()!.id;

describe('GET /volumes/:id/page-sizes', () => {
    it('measures each page once, then serves the stored sizes', async () => {
        const id = firstVolumeId();
        expect(stored(id)).toBeNull();

        expect(await sizes(id)).toEqual({
            status: 200,
            body: [
                [20, 30],
                [20, 30],
                [40, 30],
            ],
        });
        expect(stored(id)).toEqual([
            [20, 30],
            [20, 30],
            [40, 30],
        ]);
    });

    it('measures again after the file changes', async () => {
        const id = firstVolumeId();
        await sizes(id);

        await writeCbz(ctx.file('Gantz/Gantz T01.cbz'), { pages: 1 });
        await utimes(
            ctx.file('Gantz/Gantz T01.cbz'),
            new Date(),
            new Date(Date.now() + 5000),
        );
        await ctx.scanner.scan(ctx.library.id);

        expect(stored(id)).toBeNull();
        expect((await sizes(id)).body).toEqual([[20, 30]]);
    });

    it('hides the sizes of a hidden series', async () => {
        const child = sessionCookie(ctx.db, 'reader', 'child');
        ctx.db
            .update(users)
            .set({ maxAge: 10 })
            .where(eq(users.oidcSubject, 'child'))
            .run();

        expect((await sizes(firstVolumeId(), child)).status).toBe(404);
    });
});
