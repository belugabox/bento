import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { SeriesCovers } from '../src/library/covers';
import { coverFile } from '../src/library/scanner';
import {
    authDeps,
    png,
    sessionCookie,
    setup,
    silent,
    writeCbz,
} from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;
let seriesId: number;
let otherSeriesId: number;
let volumeIds: number[];

const build = (covers = ctx.covers) =>
    createApi({
        db: ctx.db,
        logger: silent,
        version: '1.0.0',
        scanner: ctx.scanner,
        pages: ctx.pages,
        coversPath: ctx.coversPath,
        files: ctx.files,
        covers,
        wikipedia: ctx.wikipedia,
        auth: authDeps(),
    });

const call = async (
    path: string,
    init: { method?: string; json?: unknown } = {},
    cookie = admin,
) => {
    const response = await api.request(path, {
        method: init.method ?? 'GET',
        headers: {
            Cookie: cookie,
            ...(init.json !== undefined && {
                'Content-Type': 'application/json',
            }),
        },
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
    return response;
};

const setCover = (json: unknown, cookie = admin) =>
    call(`/series/${seriesId}/cover`, { method: 'PUT', json }, cookie);

const coverBytes = async () =>
    Buffer.from(await (await call(`/series/${seriesId}/cover`)).arrayBuffer());

beforeEach(async () => {
    ctx = await setup();
    api = build();
    admin = sessionCookie(ctx.db, 'admin');
    await writeCbz(ctx.file('Gantz/Gantz T01.cbz'), { pages: 3 });
    await writeCbz(ctx.file('Gantz/Gantz T02.cbz'));
    await writeCbz(ctx.file('Spirale/Spirale T01.cbz'));
    await ctx.scanner.scan(ctx.library.id);
    const list = await (await call('/series')).json();
    seriesId = list.find((s: { name: string }) => s.name === 'Gantz').id;
    otherSeriesId = list.find((s: { name: string }) => s.name === 'Spirale').id;
    volumeIds = (await (await call(`/series/${seriesId}`)).json()).volumes.map(
        (v: { id: number }) => v.id,
    );
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('series cover', () => {
    it('defaults to the cover of the first volume', async () => {
        expect(
            (await coverBytes()).equals(
                await readFile(coverFile(ctx.coversPath, volumeIds[0]!)),
            ),
        ).toBe(true);
        const details = await (await call(`/series/${seriesId}`)).json();
        expect(details.coverUpdatedAt).toBeNull();
    });

    it('can use another volume, or any page of a volume', async () => {
        const before = await coverBytes();

        expect(
            (await setCover({ type: 'volume', volumeId: volumeIds[1] })).status,
        ).toBe(200);
        expect(
            (await coverBytes()).equals(
                await readFile(coverFile(ctx.coversPath, volumeIds[1]!)),
            ),
        ).toBe(true);

        await setCover({ type: 'volume', volumeId: volumeIds[0], page: 1 });
        const fromPage = await coverBytes();
        expect(fromPage.equals(before)).toBe(false);
        expect((await sharp(fromPage).metadata()).format).toBe('webp');

        const list = await (await call('/series')).json();
        expect(
            list.find((s: { id: number }) => s.id === seriesId).coverUpdatedAt,
        ).not.toBeNull();
    });

    it('goes back to the default cover', async () => {
        await setCover({ type: 'volume', volumeId: volumeIds[0], page: 2 });

        await setCover({ type: 'default' });

        expect(
            (await coverBytes()).equals(
                await readFile(coverFile(ctx.coversPath, volumeIds[0]!)),
            ),
        ).toBe(true);
    });

    it('downloads Wikimedia images only', async () => {
        const image = await png('#00ff00');
        const requested: string[] = [];
        api = build(
            new SeriesCovers(ctx.db, ctx.pages, ctx.coversPath, (async (
                url: URL,
            ) => {
                requested.push(String(url));
                return new Response(image, {
                    headers: { 'Content-Type': 'image/png' },
                });
            }) as unknown as typeof fetch),
        );

        expect(
            (
                await setCover({
                    type: 'url',
                    url: 'https://upload.wikimedia.org/a.png',
                })
            ).status,
        ).toBe(200);
        expect(requested).toEqual(['https://upload.wikimedia.org/a.png']);

        for (const url of [
            'https://evil.example.com/a.png',
            'http://upload.wikimedia.org/a.png',
            'pas une adresse',
        ]) {
            expect((await setCover({ type: 'url', url })).status, url).toBe(
                400,
            );
        }
        expect(requested).toHaveLength(1);
    });

    it('refuses a volume of another series, and non-admins', async () => {
        const spirale = (await (await call(`/series/${otherSeriesId}`)).json())
            .volumes[0].id;
        expect(
            (await setCover({ type: 'volume', volumeId: spirale })).status,
        ).toBe(400);

        const reader = sessionCookie(ctx.db, 'reader');
        expect((await setCover({ type: 'default' }, reader)).status).toBe(403);
        expect(
            (await call(`/series/${seriesId}/cover`, {}, reader)).status,
        ).toBe(200);
    });
});

describe('Wikipedia routes', () => {
    it('are for admins, and report an unreachable Wikipedia', async () => {
        const reader = sessionCookie(ctx.db, 'reader');
        expect(
            (await call('/metadata/wikipedia/search?q=gantz', {}, reader))
                .status,
        ).toBe(403);

        const response = await call(
            '/metadata/wikipedia/search?q=gantz&kind=manga',
        );
        expect(response.status).toBe(502);
        expect((await response.json()).message).toMatch(
            /Wikipédia injoignable/,
        );
        expect((await call('/metadata/wikipedia/search?q=')).status).toBe(400);
    });
});
