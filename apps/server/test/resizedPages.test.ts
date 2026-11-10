import AdmZip from 'adm-zip';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { pageWidthFor } from '../src/library/pageWidths';
import { ResizedPages } from '../src/library/resizedPages';
import { authDeps, sessionCookie, setup, silent } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let reader: string;

/** Page de 2000 × 3000, plus large que toutes les largeurs prévues. */
const bigPage = () =>
    sharp({
        create: {
            width: 2000,
            height: 3000,
            channels: 3,
            background: { r: 200, g: 40, b: 40 },
        },
    })
        .png()
        .toBuffer();

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
    reader = sessionCookie(ctx.db, 'reader', 'alice');
    const zip = new AdmZip();
    zip.addFile('01.png', await bigPage());
    zip.addFile(
        'ComicInfo.xml',
        Buffer.from(
            '<?xml version="1.0"?><ComicInfo><Series>Gantz</Series><Number>1</Number></ComicInfo>',
        ),
    );
    await mkdir(ctx.file('Gantz'), { recursive: true });
    await writeFile(ctx.file('Gantz/Gantz #01.cbz'), zip.toBuffer());
    await ctx.scanner.scan(ctx.library.id);
});

afterEach(async () => {
    await ctx.cleanup();
});

const page = async (query: string) => {
    const [series] = (await (
        await api.request('/series', { headers: { Cookie: reader } })
    ).json()) as { coverVolumeId: number }[];
    const response = await api.request(
        `/volumes/${series!.coverVolumeId}/pages/0${query}`,
        { headers: { Cookie: reader } },
    );
    return {
        type: response.headers.get('Content-Type'),
        data: Buffer.from(await response.arrayBuffer()),
    };
};

describe('pages resized to the screen', () => {
    it('serves a page reduced to the asked width, kept on disk', async () => {
        const resized = await page('?v=1&w=800');
        expect(resized.type).toBe('image/webp');
        expect((await sharp(resized.data).metadata()).width).toBe(800);

        const kept = path.join(path.dirname(ctx.coversPath), 'pages');
        const [volume] = await readdir(kept);
        expect(await readdir(path.join(kept, volume!))).toHaveLength(1);
        // Deuxième demande : la même, lue sur le disque.
        expect((await page('?v=1&w=800')).data.equals(resized.data)).toBe(true);
    });

    it('serves the original page for any other width', async () => {
        const original = await page('?v=1&w=999');
        expect(original.type).toBe('image/png');
        expect((await sharp(original.data).metadata()).width).toBe(2000);
    });

    it('drops the oldest pages beyond its limit', async () => {
        const dir = path.join(path.dirname(ctx.coversPath), 'tiny');
        // Limite de 1 octet : chaque page efface les précédentes.
        const cache = new ResizedPages(dir, 1);
        const original = async () => ({
            data: await bigPage(),
            type: 'image/png',
        });
        await cache.get(1, 1, 0, 800, original);
        await cache.get(1, 1, 1, 800, original);
        expect(await readdir(path.join(dir, '1'))).toHaveLength(0);
    });

    it('picks the width covering the short side of the screen', () => {
        // Tablette Android : 800 × 1280 points, 2 pixels par point.
        expect(pageWidthFor({ width: 800, height: 1280, pixelRatio: 2 })).toBe(
            1600,
        );
        expect(
            pageWidthFor({ width: 1280, height: 800, pixelRatio: 1.5 }),
        ).toBe(1200);
        // Écran 4K : la page d'origine.
        expect(
            pageWidthFor({ width: 3840, height: 2160, pixelRatio: 1 }),
        ).toBeUndefined();
    });
});
