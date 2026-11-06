import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import {
    MangaNews,
    ageRatingOf,
    decodePage,
    parseSearchPage,
    parseSeriesPage,
} from '../src/metadata/mangaNews';
import { authDeps, sessionCookie, setup, silent } from './helpers';

// Extraits réels des pages, réduits aux blocs lus (novembre 2026).
const page = (name: string) =>
    readFileSync(path.join(__dirname, 'fixtures/manga-news', name), 'utf-8');

/** Site simulé : la réponse dépend de l'adresse demandée. */
const fakeSite = (respond: (url: string) => unknown) =>
    (async (url: string | URL | Request) =>
        respond(String(url))) as unknown as typeof fetch;

const fakeFetch = (status: number, body: string) =>
    fakeSite(() => new Response(body, { status }));

describe('parseSeriesPage', () => {
    it('reads a manga sheet', () => {
        expect(
            parseSeriesPage(page('spy-x-family.html'), 'Spy-X-Family'),
        ).toMatchObject({
            title: 'Spy X Family',
            url: 'https://www.manga-news.com/index.php/serie/Spy-X-Family',
            writer: 'Tatsuya ENDÔ',
            penciller: 'Tatsuya ENDÔ',
            publisher: 'Kurokawa',
            format: 'manga',
            audience: 'shonen',
            genres: ['Suspense', 'Fantastique'],
            themes: [
                'espion',
                'espionnage',
                'famille',
                'pouvoirs',
                'télépathe',
                'tueur',
            ],
            year: 2019,
            age: 12,
            ageRating: 'Teen',
            volumeCount: 16,
            ongoing: true,
            summary: expect.stringMatching(/^Twilight, le plus grand espion/),
            // Image en grand, celle du lien.
            coverUrl:
                'https://www.manga-news.com/public/images/series/Spy-Family-1-kurokawa.webp',
        });
    });

    it('reads a finished manhwa, from its type', () => {
        expect(
            parseSeriesPage(page('solo-leveling.html'), 'Solo-Leveling'),
        ).toMatchObject({
            originalTitle: '나 혼자만 레벨업',
            publisher: 'Kbooks, Verytoon, Piccoma',
            format: 'manhwa',
            audience: null,
            volumeCount: 19,
            ongoing: false,
        });
    });

    it('finds nothing on a page without a series', () => {
        expect(parseSeriesPage('<html></html>', 'x')).toBeUndefined();
    });
});

describe('parseSearchPage', () => {
    it('keeps the series of the "Séries Manga VF" section only', () => {
        const results = parseSearchPage(page('search-spy-family.html'));
        expect(results).toHaveLength(3);
        expect(results[0]).toEqual({
            id: 'Spy-X-Family',
            title: 'Spy X Family',
            year: 2019,
            authors: 'Tatsuya ENDÔ',
            coverUrl:
                'https://www.manga-news.com/public/images/series/.Spy-Family-1-kurokawa_small.webp',
        });
    });
});

describe('decodePage', () => {
    it('reads UTF-8 pages and older Windows-1252 ones', () => {
        expect(decodePage(Buffer.from('Scénario', 'utf-8'))).toBe('Scénario');
        expect(decodePage(Buffer.from('Scénario', 'latin1'))).toBe('Scénario');
        // « ’ » : 0x92 en Windows-1252.
        expect(decodePage(Uint8Array.from([0x6c, 0x92, 0x65]))).toBe('l’e');
    });
});

describe('ageRatingOf', () => {
    it('rounds up to the next ComicInfo rating', () => {
        expect(ageRatingOf(0)).toBe('Everyone');
        expect(ageRatingOf(10)).toBe('Everyone 10+');
        expect(ageRatingOf(12)).toBe('Teen');
        expect(ageRatingOf(16)).toBe('Mature 17+');
        expect(ageRatingOf(18)).toBe('Adults Only 18+');
    });
});

describe('MangaNews', () => {
    it('gives up on an anti-bot check, without working around it', async () => {
        const site = new MangaNews(
            fakeFetch(403, '<title>Just a moment...</title>'),
        );
        await expect(site.search('spy')).rejects.toMatchObject({
            status: 502,
            message: expect.stringMatching(/anti-robot/),
        });
    });

    it('reads a normal page, with the script Cloudflare adds to all', async () => {
        const site = new MangaNews(
            fakeFetch(
                200,
                page('spy-x-family.html') +
                    '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>',
            ),
        );
        expect((await site.series('Spy-X-Family')).title).toBe('Spy X Family');
    });

    it('reports a missing series', async () => {
        const site = new MangaNews(fakeFetch(404, ''));
        await expect(site.series('Inconnue')).rejects.toMatchObject({
            status: 404,
        });
        await expect(site.series('../admin')).rejects.toMatchObject({
            status: 400,
        });
    });

    it('fetches a series page', async () => {
        const urls: string[] = [];
        const site = new MangaNews(
            fakeSite((url) => {
                urls.push(url);
                return new Response(page('spy-x-family.html'));
            }),
        );
        expect((await site.series('Spy-X-Family')).title).toBe('Spy X Family');
        expect(urls).toEqual([
            'https://www.manga-news.com/index.php/serie/Spy-X-Family',
        ]);
    });
});

describe('GET /metadata/manga-news', () => {
    it('searches and reads a sheet, for admins only', async () => {
        const ctx = await setup();
        const api = createApi({
            db: ctx.db,
            logger: silent,
            version: '1.0.0',
            scanner: ctx.scanner,
            pages: ctx.pages,
            coversPath: ctx.coversPath,
            files: ctx.files,
            covers: ctx.covers,
            wikipedia: ctx.wikipedia,
            mangaNews: new MangaNews(
                fakeSite(
                    (url) =>
                        new Response(
                            page(
                                url.includes('/recherche/')
                                    ? 'search-spy-family.html'
                                    : 'spy-x-family.html',
                            ),
                        ),
                ),
            ),
            auth: authDeps(),
        });
        const get = (url: string, role: 'admin' | 'reader') =>
            api.request(url, {
                headers: { Cookie: sessionCookie(ctx.db, role) },
            });

        const search = await get('/metadata/manga-news/search?q=spy', 'admin');
        expect((await search.json())[0].id).toBe('Spy-X-Family');
        const sheet = await get(
            '/metadata/manga-news/series?id=Spy-X-Family',
            'admin',
        );
        expect((await sheet.json()).audience).toBe('shonen');
        expect(
            (await get('/metadata/manga-news/search?q=spy', 'reader')).status,
        ).toBe(403);
        await ctx.cleanup();
    });
});
