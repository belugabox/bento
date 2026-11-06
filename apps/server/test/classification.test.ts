import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { DEFAULT_GENRES, classify } from '../src/classification';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

describe('classify', () => {
    it('names known genres from the list, whatever the case or accents', () => {
        expect(
            classify('action, HUMOUR,Science fiction', null, DEFAULT_GENRES),
        ).toEqual({
            genres: ['Action', 'Comédie', 'Science-fiction'],
            themes: [],
            audience: null,
        });
    });

    it('puts the audience aside, drops ages, keeps the rest as themes', () => {
        expect(
            classify(
                'Shōnen, Action, Mature 17+, 12+, Espionnage',
                'famille; Sport',
                DEFAULT_GENRES,
            ),
        ).toEqual({
            genres: ['Action', 'Sport'],
            themes: ['Espionnage', 'famille'],
            audience: 'shonen',
        });
    });
});

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;
let reader: string;

const call = async (
    path: string,
    cookie: string,
    init: { method?: string; json?: unknown } = {},
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
    return { status: response.status, body: await response.json() };
};

const genreId = async (name: string) =>
    (await call('/genres', admin)).body.find(
        (g: { name: string }) => g.name === name,
    ).id as number;

const series = async () => (await call('/series', reader)).body[0];

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
    reader = sessionCookie(ctx.db, 'reader');
    await writeCbz(ctx.file('Spy/Spy #01.cbz'), {
        comicInfo:
            '<Series>Spy</Series><Number>1</Number><Genre>Seinen, Humour, Suspense</Genre><Tags>Espions</Tags>',
    });
    await ctx.scanner.scan(ctx.library.id);
});

afterEach(async () => {
    await ctx.cleanup?.();
});

describe('genres', () => {
    it('starts with the default list, counting series', async () => {
        const { body } = await call('/genres', reader);
        expect(body).toHaveLength(DEFAULT_GENRES.length);
        expect(
            body.find((g: { name: string }) => g.name === 'Comédie'),
        ).toMatchObject({
            aliases: ['Humour', 'Parodie', 'Comedy'],
            seriesCount: 1,
        });
    });

    it('classifies series with the list, and finds them by theme', async () => {
        expect(await series()).toMatchObject({
            format: 'manga',
            audience: 'seinen',
            genres: ['Comédie', 'Thriller'],
            themes: ['Espions'],
        });
        const found = await call('/series?search=espion', reader);
        expect(found.body).toHaveLength(1);
    });

    it('is managed by the admin only', async () => {
        const json = { name: 'Espionnage', aliases: ['Espions'] };
        expect(
            (await call('/genres', reader, { method: 'POST', json })).status,
        ).toBe(403);

        const created = await call('/genres', admin, { method: 'POST', json });
        expect(created.body).toMatchObject(json);
        expect((await series()).genres).toEqual([
            'Comédie',
            'Thriller',
            'Espionnage',
        ]);
        expect((await series()).themes).toEqual([]);
        // Nom déjà reconnu par un autre genre.
        const taken = await call('/genres', admin, {
            method: 'POST',
            json: { name: 'Humour' },
        });
        expect(taken.status).toBe(409);
    });

    it('keeps the old name as an alias when renamed', async () => {
        const id = await genreId('Thriller');
        const { body } = await call(`/genres/${id}`, admin, {
            method: 'PATCH',
            json: { name: 'Suspense et thriller' },
        });
        expect(body.aliases).toContain('Thriller');
        expect((await series()).genres).toContain('Suspense et thriller');
    });

    it('merges a genre into another, or leaves a theme when deleted', async () => {
        const thriller = await genreId('Thriller');
        const comedy = await genreId('Comédie');
        await call(`/genres/${thriller}?into=${comedy}`, admin, {
            method: 'DELETE',
        });
        expect((await series()).genres).toEqual(['Comédie']);

        await call(`/genres/${comedy}`, admin, { method: 'DELETE' });
        expect(await series()).toMatchObject({
            genres: [],
            themes: ['Humour', 'Suspense', 'Espions'],
        });
    });
});

describe('format and audience', () => {
    it('are set by the admin, and a webtoon scrolls by default', async () => {
        const { id } = await series();
        const json = { format: 'webtoon', audience: 'shonen' };
        expect(
            (
                await call(`/series/${id}/classification`, reader, {
                    method: 'PUT',
                    json,
                })
            ).status,
        ).toBe(403);

        await call(`/series/${id}/classification`, admin, {
            method: 'PUT',
            json,
        });

        expect(await series()).toMatchObject(json);
        const details = (await call(`/series/${id}`, reader)).body;
        expect(details).toMatchObject({
            format: 'webtoon',
            defaultFormat: 'manga',
            audience: 'shonen',
            // Trouvé parmi les genres du fichier.
            defaultAudience: 'seinen',
            defaultReadingMode: 'webtoon',
        });
        const volume = (await call(`/volumes/${details.volumes[0].id}`, reader))
            .body;
        expect(volume.readingMode).toBe('webtoon');

        // Retour au format de la bibliothèque.
        await call(`/series/${id}/classification`, admin, {
            method: 'PUT',
            json: { format: null },
        });
        expect(await series()).toMatchObject({
            format: 'manga',
            audience: 'shonen',
        });
    });

    it('chosen on a draft folder, are applied when it is published', async () => {
        await writeCbz(ctx.file('_draft/Solo/Solo T01.cbz'), {
            comicInfo: '<Series>Solo</Series><Number>1</Number>',
        });
        await call(
            `/libraries/${ctx.library.id}/drafts/classification`,
            admin,
            {
                method: 'PUT',
                json: {
                    folder: '_draft/Solo',
                    format: 'manhwa',
                    audience: 'shonen',
                },
            },
        );
        const drafts = (
            await call(`/libraries/${ctx.library.id}/drafts`, admin)
        ).body;
        expect(drafts[0]).toMatchObject({
            format: 'manhwa',
            audience: 'shonen',
        });

        await ctx.files.publish(ctx.library.id, ['_draft/Solo/Solo T01.cbz']);

        const solo = (await call('/series', reader)).body.find(
            (s: { name: string }) => s.name === 'Solo',
        );
        expect(solo).toMatchObject({ format: 'manhwa', audience: 'shonen' });
    });
});
