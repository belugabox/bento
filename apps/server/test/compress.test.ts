import AdmZip from 'adm-zip';
import { randomBytes } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { listSeries } from '../src/library/catalog';
import { CompressionQueue } from '../src/library/compression';
import { DEFAULT_SOURCE_PRIORITY } from '../src/metadata/sourceLink';
import { SettingsStore } from '../src/settings';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;
let queue: CompressionQueue;
let settings: SettingsStore;

const ADMIN_VIEW = { id: 0, role: 'admin' as const, maxAge: null };

/** Page « scannée » : du bruit, que le PNG compresse mal. */
const noisyPng = (width: number, height: number) =>
    sharp(randomBytes(width * height * 3), {
        raw: { width, height, channels: 3 },
    })
        .png()
        .toBuffer();

const writeHeavyCbz = async (relative: string) => {
    const zip = new AdmZip();
    zip.addFile('01.png', await noisyPng(400, 3000));
    zip.addFile('02.png', await noisyPng(400, 600));
    zip.addFile(
        'ComicInfo.xml',
        Buffer.from(
            '<?xml version="1.0"?><ComicInfo><Series>Gantz</Series><Number>1</Number></ComicInfo>',
        ),
    );
    const fullPath = ctx.file(relative);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, zip.toBuffer());
    return fullPath;
};

/** Compresse via la file, puis renvoie la tâche de ce fichier. */
const compress = async (path: string) => {
    const response = await post('compress', { paths: [path] });
    expect(response.status).toBe(200);
    await queue.idle();
    const { jobs } = await (
        await api.request('/compression', { headers: { Cookie: admin } })
    ).json();
    return jobs.find((job: { path: string }) => job.path === path);
};

const post = (route: string, json: unknown, cookie = admin) =>
    api.request(`/libraries/${ctx.library.id}/files/${route}`, {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
    });

beforeEach(async () => {
    ctx = await setup();
    settings = new SettingsStore(ctx.db);
    queue = new CompressionQueue(
        ctx.files,
        silent,
        () => settings.get().compression,
    );
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
        settings,
        compression: queue,
    });
    admin = sessionCookie(ctx.db, 'admin');
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('compression', () => {
    it('estimates the gain without touching the file', async () => {
        const fullPath = await writeHeavyCbz('_draft/Gantz T01.cbz');
        const before = await stat(fullPath);

        const response = await post('compression/estimate', {
            path: '_draft/Gantz T01.cbz',
        });

        const estimate = await response.json();
        expect(estimate.originalSize).toBe(before.size);
        expect(estimate.compressedSize).toBeLessThan(before.size * 0.8);
        expect((await stat(fullPath)).mtimeMs).toBe(before.mtimeMs);
    });

    it('recompresses the pages, keeping their order and the ComicInfo', async () => {
        const fullPath = await writeHeavyCbz('_draft/Gantz T01.cbz');
        const { size } = await stat(fullPath);

        const result = await compress('_draft/Gantz T01.cbz');

        expect(result.state).toBe('done');
        expect(result.originalSize).toBe(size);
        expect(result.compressedSize).toBe((await stat(fullPath)).size);
        expect(result.compressedSize).toBeLessThan(size);
        const zip = new AdmZip(fullPath);
        expect(zip.getEntries().map((e) => e.entryName)).toEqual([
            '01.jpg',
            '02.jpg',
            'ComicInfo.xml',
        ]);
        // Page trop haute : ramenée à 2400 px.
        const first = await sharp(zip.getEntry('01.jpg')!.getData()).metadata();
        expect(first.height).toBe(2400);
        expect(zip.readAsText('ComicInfo.xml')).toContain(
            '<Series>Gantz</Series>',
        );
    });

    it('leaves a file alone when it would not get smaller', async () => {
        await writeCbz(ctx.file('_draft/Spirale T01.cbz'));
        const fullPath = ctx.file('_draft/Spirale T01.cbz');
        const before = await stat(fullPath);

        const result = await compress('_draft/Spirale T01.cbz');

        expect(result).toMatchObject({
            state: 'done',
            originalSize: before.size,
            compressedSize: before.size,
        });
        expect((await stat(fullPath)).mtimeMs).toBe(before.mtimeMs);
    });

    it('rescans a published volume', async () => {
        await writeHeavyCbz('Gantz/Gantz #01.cbz');
        await ctx.scanner.scan(ctx.library.id);

        const result = await compress('Gantz/Gantz #01.cbz');

        const details = await (
            await api.request(
                `/series/${listSeries(ctx.db, ADMIN_VIEW)[0]!.id}`,
                {
                    headers: { Cookie: admin },
                },
            )
        ).json();
        expect(details.volumes[0].size).toBe(result.compressedSize);
    });

    it('is for admins', async () => {
        await writeCbz(ctx.file('_draft/Spirale T01.cbz'));
        const reader = sessionCookie(ctx.db, 'reader');
        expect(
            (
                await post(
                    'compress',
                    { paths: ['_draft/Spirale T01.cbz'] },
                    reader,
                )
            ).status,
        ).toBe(403);
        expect(
            (await post('compress', { paths: ['../secret.cbz'] })).status,
        ).toBe(400);
    });

    it('reports a failed volume, and forgets finished ones', async () => {
        await mkdir(ctx.file('_draft'), { recursive: true });
        await writeFile(ctx.file('_draft/broken.cbz'), 'pas une archive');

        const job = await compress('_draft/broken.cbz');

        expect(job.state).toBe('failed');
        expect(job.error).toMatch(/Archive illisible/);
        const cleared = await api.request('/compression', {
            method: 'DELETE',
            headers: { Cookie: admin },
        });
        expect((await cleared.json()).jobs).toEqual([]);
    });

    it('follows the settings chosen by the admin', async () => {
        const fullPath = await writeHeavyCbz('_draft/Gantz T01.cbz');
        const put = (json: unknown, cookie = admin) =>
            api.request('/settings', {
                method: 'PUT',
                headers: { Cookie: cookie, 'Content-Type': 'application/json' },
                body: JSON.stringify(json),
            });

        const saved = await put({ compression: { maxHeight: null } });
        expect((await saved.json()).settings.compression).toEqual({
            quality: 90,
            maxHeight: null,
        });
        await compress('_draft/Gantz T01.cbz');

        // Taille gardée : la page de 3000 px n'est pas réduite.
        const first = await sharp(
            new AdmZip(fullPath).getEntry('01.jpg')!.getData(),
        ).metadata();
        expect(first.height).toBe(3000);
    });
});

describe('settings', () => {
    it('are read and changed by the admin, with their defaults', async () => {
        const read = await api.request('/settings', {
            headers: { Cookie: admin },
        });
        expect(await read.json()).toEqual({
            settings: {
                compression: { quality: 90, maxHeight: 2400 },
                scanIntervalMinutes: 30,
                appearance: { colorScheme: 'auto', accent: 'violet' },
                ages: [0, 8, 10, 12, 14, 16, 18],
                sourcePriority: DEFAULT_SOURCE_PRIORITY,
            },
            defaults: {
                compression: { quality: 90, maxHeight: 2400 },
                scanIntervalMinutes: 30,
                appearance: { colorScheme: 'auto', accent: 'violet' },
                ages: [0, 8, 10, 12, 14, 16, 18],
                sourcePriority: DEFAULT_SOURCE_PRIORITY,
            },
        });

        const put = (json: unknown, cookie = admin) =>
            api.request('/settings', {
                method: 'PUT',
                headers: { Cookie: cookie, 'Content-Type': 'application/json' },
                body: JSON.stringify(json),
            });
        const changed = await put({
            compression: { quality: 70 },
            scanIntervalMinutes: 0,
            appearance: { accent: 'teal' },
            // Un champ seulement : les autres gardent leur site.
            sourcePriority: { Writer: 'wikipedia' },
        });
        expect((await changed.json()).settings).toEqual({
            compression: { quality: 70, maxHeight: 2400 },
            scanIntervalMinutes: 0,
            appearance: { colorScheme: 'auto', accent: 'teal' },
            ages: [0, 8, 10, 12, 14, 16, 18],
            sourcePriority: { ...DEFAULT_SOURCE_PRIORITY, Writer: 'wikipedia' },
        });
        expect((await put({ sourcePriority: { Writer: 'imdb' } })).status).toBe(
            400,
        );
        // Thème par défaut, lu sans session (page de connexion).
        expect(await (await api.request('/appearance')).json()).toEqual({
            colorScheme: 'auto',
            accent: 'teal',
        });
        expect((await put({ appearance: { accent: 'fuchsia' } })).status).toBe(
            400,
        );
        // Gardés en base.
        expect(new SettingsStore(ctx.db).get().compression.quality).toBe(70);

        expect((await put({ compression: { quality: 10 } })).status).toBe(400);
        const reader = sessionCookie(ctx.db, 'reader');
        expect((await put({ scanIntervalMinutes: 5 }, reader)).status).toBe(
            403,
        );
    });

    it('tell who listens that they changed', () => {
        const seen: number[] = [];
        settings.onChange((next) => seen.push(next.scanIntervalMinutes));
        settings.update({ scanIntervalMinutes: 60 });
        expect(seen).toEqual([60]);
    });
});
