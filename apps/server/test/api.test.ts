import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;

beforeEach(async () => {
    ctx = await setup();
    api = createApi({
        db: ctx.db,
        logger: silent,
        version: '1.2.3',
        scanner: ctx.scanner,
        pages: ctx.pages,
        coversPath: ctx.coversPath,
    });
});

afterEach(async () => {
    await ctx.cleanup();
});

const get = async (path: string) => {
    const response = await api.request(path);
    return { status: response.status, body: await response.json() };
};

/** Deux séries scannées ; renvoie l'id de Spy x Family. */
const library = async () => {
    await writeCbz(ctx.file('Spy x Family/Spy x Family T01.cbz'), { pages: 3 });
    await writeCbz(ctx.file('Spy x Family/Spy x Family T02.cbz'));
    await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));
    await ctx.scanner.scan(ctx.library.id);
    const { body } = await get('/series?search=spy');
    return body[0].id as number;
};

describe('GET /health', () => {
    it('reports the server as up with its version', async () => {
        expect(await get('/health')).toEqual({
            status: 200,
            body: { status: 'ok', version: '1.2.3' },
        });
    });
});

describe('error handling', () => {
    it('hides internal errors behind a generic 500', async () => {
        const app = api.get('/boom', () => {
            throw new Error('secret internal detail');
        });

        const response = await app.request('/boom');

        expect(response.status).toBe(500);
        const body = await response.text();
        expect(body).toContain('Erreur interne du serveur');
        expect(body).not.toContain('secret');
    });
});

describe('libraries', () => {
    it('counts every series and volume of each library', async () => {
        await library();

        expect((await get('/libraries')).body).toEqual([
            expect.objectContaining({ seriesCount: 2, volumeCount: 3 }),
        ]);
    });

    it('lists libraries with their counts, and scans on demand', async () => {
        await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));

        const scan = await api.request(`/libraries/${ctx.library.id}/scan`, {
            method: 'POST',
        });
        expect(await scan.json()).toMatchObject({ added: 1 });

        expect((await get('/libraries')).body).toEqual([
            expect.objectContaining({
                name: 'Mangas',
                type: 'manga',
                seriesCount: 1,
                volumeCount: 1,
                scanning: false,
            }),
        ]);
    });

    it('refuses to scan an unknown library', async () => {
        const response = await api.request('/libraries/999/scan', {
            method: 'POST',
        });
        expect(response.status).toBe(404);
    });
});

describe('series', () => {
    it('lists, filters and details series', async () => {
        const id = await library();

        const all = (await get('/series')).body;
        expect(all.map((s: { name: string }) => s.name)).toEqual([
            'Gantz',
            'Spy x Family',
        ]);
        expect(all[1]).toMatchObject({ volumeCount: 2 });
        // Couverture de chaque série : celle de son premier tome.
        for (const series of all) {
            const { body: details } = await get(`/series/${series.id}`);
            expect(series.coverVolumeId).toBe(details.volumes[0].id);
        }

        const { body } = await get(`/series/${id}`);
        expect(body.volumes.map((v: { number: string }) => v.number)).toEqual([
            '1',
            '2',
        ]);
        expect((await get('/series/999')).status).toBe(404);
        expect((await get('/series/abc')).status).toBe(400);
    });
});

describe('volumes', () => {
    it('gives reading info without the file path', async () => {
        const seriesId = await library();
        const [first, second] = (await get(`/series/${seriesId}`)).body.volumes;

        const { body } = await get(`/volumes/${first.id}`);

        expect(body).toEqual({
            id: first.id,
            seriesId,
            seriesName: 'Spy x Family',
            number: '1',
            title: null,
            pageCount: 3,
            libraryType: 'manga',
            direction: 'rtl',
            previousId: null,
            nextId: second.id,
        });
    });

    it('serves the cover and the pages', async () => {
        const seriesId = await library();
        const [first] = (await get(`/series/${seriesId}`)).body.volumes;

        const cover = await api.request(`/volumes/${first.id}/cover`);
        expect(cover.status).toBe(200);
        expect(cover.headers.get('content-type')).toBe('image/webp');

        const page = await api.request(`/volumes/${first.id}/pages/2`);
        expect(page.status).toBe(200);
        expect(page.headers.get('content-type')).toBe('image/png');

        expect((await api.request(`/volumes/${first.id}/pages/3`)).status).toBe(
            404,
        );
    });
});
