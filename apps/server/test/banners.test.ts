import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { series } from '../src/db/schema';
import { SeriesBanners } from '../src/library/banners';
import { listSeries } from '../src/library/catalog';
import { type AniList, parseBanners } from '../src/metadata/anilist';
import type { MangaNews } from '../src/metadata/mangaNews';
import { parseSeriesPage } from '../src/metadata/mangaNews';
import {
    authDeps,
    png,
    sessionCookie,
    setup,
    silent,
    writeCbz,
} from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
const ADMIN = { id: 0, role: 'admin' as const, maxAge: null };

describe('banners from the online sheets', () => {
    it('reads the banner at the top of a Manga-news sheet', () => {
        const page = (banner: string) =>
            `<h1 class="entry-page-title">Spy X Family</h1>${banner}`;
        expect(
            parseSeriesPage(
                page(
                    '<div class="product-banner"><img src="https://www.manga-news.com/public/images/series/banners/spy-x-family-manga-header.jpg"></div>',
                ),
                'Spy-X-Family',
            )?.bannerUrl,
        ).toBe(
            'https://www.manga-news.com/public/images/series/banners/spy-x-family-manga-header.jpg',
        );
        expect(
            parseSeriesPage(page(''), 'Spy-X-Family')?.bannerUrl,
        ).toBeUndefined();
    });

    it('keeps the AniList mangas that have a banner', () => {
        expect(
            parseBanners({
                data: {
                    Page: {
                        media: [
                            {
                                id: 108556,
                                title: {
                                    romaji: 'SPY×FAMILY',
                                    english: 'SPY x FAMILY',
                                },
                                bannerImage: 'https://s4.anilist.co/banner.jpg',
                                coverImage: { color: '#e4505d' },
                            },
                            {
                                id: 2,
                                title: {
                                    romaji: 'Sans bannière',
                                    english: null,
                                },
                                bannerImage: null,
                                coverImage: null,
                            },
                        ],
                    },
                },
            }),
        ).toEqual([
            {
                id: 108556,
                title: 'SPY x FAMILY',
                bannerUrl: 'https://s4.anilist.co/banner.jpg',
                color: '#e4505d',
            },
        ]);
    });
});

describe('series banner', () => {
    let api: ReturnType<typeof createApi>;
    let gantzId: number;
    const downloaded: string[] = [];

    beforeEach(async () => {
        ctx = await setup();
        await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));
        await ctx.scanner.scan(ctx.library.id);
        gantzId = listSeries(ctx.db, ADMIN)[0]!.id;
        ctx.db.update(series).set({ sources: 'manga-news:Gantz' }).run();
        downloaded.length = 0;
        // Une grande image, comme une bannière.
        const image = await sharp(await png('#cc3344'))
            .resize(2400, 600)
            .png()
            .toBuffer();
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
            mangaNews: {
                series: async () => ({
                    title: 'Gantz',
                    bannerUrl:
                        'https://www.manga-news.com/public/images/series/banners/gantz.jpg',
                }),
            } as unknown as MangaNews,
            anilist: {
                banners: async () => [
                    {
                        id: 1,
                        title: 'GANTZ',
                        bannerUrl: 'https://s4.anilist.co/gantz.jpg',
                        color: null,
                    },
                ],
            } as unknown as AniList,
            banners: new SeriesBanners(ctx.db, ctx.coversPath, (async (
                url: URL,
            ) => {
                downloaded.push(String(url));
                return new Response(new Uint8Array(image), {
                    headers: { 'Content-Type': 'image/png' },
                });
            }) as unknown as typeof fetch),
            auth: authDeps(),
        });
    });

    afterEach(async () => {
        await ctx.cleanup();
    });

    const call = (path: string, init: RequestInit = {}, role = 'admin') =>
        api.request(path, {
            ...init,
            headers: {
                Cookie: sessionCookie(ctx.db, role as 'admin' | 'reader'),
                'Content-Type': 'application/json',
            },
        });

    it('offers the banners of Manga-news and AniList, then keeps the one chosen', async () => {
        const choices = await (await call(`/series/${gantzId}/banners`)).json();
        expect(choices).toEqual({
            banners: [
                {
                    site: 'manga-news',
                    url: 'https://www.manga-news.com/public/images/series/banners/gantz.jpg',
                    title: 'Gantz',
                },
                {
                    site: 'anilist',
                    url: 'https://s4.anilist.co/gantz.jpg',
                    title: 'GANTZ',
                },
            ],
            errors: [],
        });
        // Pas pour les lecteurs.
        expect(
            (await call(`/series/${gantzId}/banners`, {}, 'reader')).status,
        ).toBe(403);
        expect((await call(`/series/${gantzId}/banner`)).status).toBe(404);

        const set = await call(`/series/${gantzId}/banner`, {
            method: 'PUT',
            body: JSON.stringify({ url: 'https://s4.anilist.co/gantz.jpg' }),
        });
        expect((await set.json()).bannerUpdatedAt).toEqual(expect.any(String));
        // Réduite à 1 600 px, en WebP ; visible de tous.
        const image = await call(`/series/${gantzId}/banner`, {}, 'reader');
        expect(image.headers.get('content-type')).toBe('image/webp');
        const { width } = await sharp(
            Buffer.from(await image.arrayBuffer()),
        ).metadata();
        expect(width).toBe(1600);
        expect(
            (await (await call(`/series/${gantzId}`)).json()).bannerUpdatedAt,
        ).toEqual(expect.any(String));

        await call(`/series/${gantzId}/banner`, { method: 'DELETE' });
        expect((await call(`/series/${gantzId}/banner`)).status).toBe(404);
    });

    it('downloads banners from Manga-news and AniList only', async () => {
        const refused = await call(`/series/${gantzId}/banner`, {
            method: 'PUT',
            body: JSON.stringify({ url: 'https://example.com/image.jpg' }),
        });
        expect(refused.status).toBe(400);
        expect(downloaded).toEqual([]);
    });
});
