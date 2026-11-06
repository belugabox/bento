import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { DEFAULT_GENRES, classify } from '../src/classification';
import { users } from '../src/db/schema';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

describe('classify', () => {
    it('names known genres from the list, whatever the case or accents', () => {
        expect(
            classify('action, HUMOUR,Science fiction', null, DEFAULT_GENRES),
        ).toEqual({
            genres: ['Action', 'Comédie', 'Science-fiction'],
            themes: [],
        });
    });

    it('drops ages, keeps the rest as themes', () => {
        expect(
            classify(
                'Shōnen, Action, Mature 17+, 12+, Espionnage',
                'famille; Sport',
                DEFAULT_GENRES,
            ),
        ).toEqual({
            genres: ['Action', 'Sport'],
            themes: ['Shōnen', 'Espionnage', 'famille'],
        });
    });

    it('drops ComicInfo ratings found among the genres', () => {
        expect(
            classify(
                'PG, MA15+, Kids to Adults, R18+, Sport',
                null,
                DEFAULT_GENRES,
            ),
        ).toEqual({ genres: ['Sport'], themes: [] });
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
            '<Series>Spy</Series><Number>1</Number><Genre>Humour, Suspense</Genre><Tags>Espions</Tags>',
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
            // Pas de format par défaut : à choisir.
            format: null,
            genres: ['Comédie', 'Thriller'],
            themes: ['Espions'],
        });
        const found = await call('/series?search=espion', reader);
        expect(found.body).toHaveLength(1);
        // Par le genre de la liste (« Humour » dans le fichier), sans accent.
        for (const search of ['comedie', 'humour', 'thriller']) {
            const { body } = await call(`/series?search=${search}`, reader);
            expect(body).toHaveLength(1);
        }
        expect((await call('/series?search=horreur', reader)).body).toEqual([]);
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

const formatId = async (name: string) =>
    (await call('/formats', admin)).body.find(
        (f: { name: string }) => f.name === name,
    ).id as number;

describe('formats', () => {
    it('start with the default list, managed by the admin only', async () => {
        const { body } = await call('/formats', reader);
        expect(body.map((f: { name: string }) => f.name)).toEqual([
            'Manga',
            'Manhwa',
            'Manhua',
            'Webtoon',
            'BD',
            'Comics',
        ]);
        const json = { name: 'Roman graphique', readingMode: 'ltr' };
        expect(
            (await call('/formats', reader, { method: 'POST', json })).status,
        ).toBe(403);
        expect(
            (await call('/formats', admin, { method: 'POST', json })).body,
        ).toMatchObject(json);
        expect(
            (
                await call('/formats', admin, {
                    method: 'POST',
                    json: { name: 'manga', readingMode: 'rtl' },
                })
            ).status,
        ).toBe(409);
    });

    it('give their reading mode to the series without one', async () => {
        const { id } = await series();
        const webtoon = await formatId('Webtoon');
        expect(
            (
                await call(`/series/${id}/classification`, reader, {
                    method: 'PUT',
                    json: { formatId: webtoon },
                })
            ).status,
        ).toBe(403);

        await call(`/series/${id}/classification`, admin, {
            method: 'PUT',
            json: { formatId: webtoon },
        });

        expect(await series()).toMatchObject({
            formatId: webtoon,
            format: 'Webtoon',
        });
        const details = (await call(`/series/${id}`, reader)).body;
        expect(details).toMatchObject({
            format: 'Webtoon',
            defaultReadingMode: 'webtoon',
        });
        const volume = (await call(`/volumes/${details.volumes[0].id}`, reader))
            .body;
        expect(volume.readingMode).toBe('webtoon');

        // Format inconnu : refusé, pour une série comme pour un brouillon.
        expect(
            (
                await call(`/series/${id}/classification`, admin, {
                    method: 'PUT',
                    json: { formatId: 999 },
                })
            ).status,
        ).toBe(400);
        expect(
            (
                await call(
                    `/libraries/${ctx.library.id}/drafts/classification`,
                    admin,
                    {
                        method: 'PUT',
                        json: { folder: '_draft/Spy', formatId: 999 },
                    },
                )
            ).status,
        ).toBe(400);

        // Format supprimé : la série n'en a plus.
        await call(`/formats/${webtoon}`, admin, { method: 'DELETE' });
        expect(await series()).toMatchObject({ formatId: null, format: null });
    });

    it('is required to publish a draft, unless its series has one', async () => {
        await writeCbz(ctx.file('_draft/Solo/Solo T01.cbz'), {
            comicInfo: '<Series>Solo</Series><Number>1</Number>',
        });
        const { published, failures } = await ctx.files.publish(
            ctx.library.id,
            ['_draft/Solo/Solo T01.cbz'],
        );
        expect(published).toEqual([]);
        expect(failures).toEqual([
            {
                path: '_draft/Solo/Solo T01.cbz',
                reason: 'il faut choisir le format de la série',
            },
        ]);

        // Un tome de plus pour « Spy », qui a déjà un format.
        const { id } = await series();
        await call(`/series/${id}/classification`, admin, {
            method: 'PUT',
            json: { formatId: await formatId('Manga') },
        });
        await writeCbz(ctx.file('_draft/Spy/Spy T02.cbz'), {
            comicInfo: '<Series>Spy</Series><Number>2</Number>',
        });
        const second = await ctx.files.publish(ctx.library.id, [
            '_draft/Spy/Spy T02.cbz',
        ]);
        expect(second.failures).toEqual([]);
    });

    it('and age, chosen on a draft folder, are applied when it is published', async () => {
        await writeCbz(ctx.file('_draft/Solo/Solo T01.cbz'), {
            comicInfo: '<Series>Solo</Series><Number>1</Number>',
        });
        const manhwa = await formatId('Manhwa');
        await call(
            `/libraries/${ctx.library.id}/drafts/classification`,
            admin,
            {
                method: 'PUT',
                json: { folder: '_draft/Solo', formatId: manhwa, age: 12 },
            },
        );
        const drafts = (
            await call(`/libraries/${ctx.library.id}/drafts`, admin)
        ).body;
        expect(drafts[0]).toMatchObject({ formatId: manhwa, age: 12 });

        await ctx.files.publish(ctx.library.id, ['_draft/Solo/Solo T01.cbz']);

        const solo = (await call('/series', reader)).body.find(
            (s: { name: string }) => s.name === 'Solo',
        );
        expect(solo).toMatchObject({ format: 'Manhwa', age: 12 });
    });
});

describe('age', () => {
    it('chosen in Bento, decides who sees the series', async () => {
        const { id } = await series();
        const child = sessionCookie(ctx.db, 'reader', 'child');
        ctx.db
            .update(users)
            .set({ maxAge: 12 })
            .where(eq(users.oidcSubject, 'child'))
            .run();
        // Sans classification : masquée aux comptes limités.
        expect((await call('/series', child)).body).toEqual([]);

        await call(`/series/${id}/classification`, admin, {
            method: 'PUT',
            json: { age: 12 },
        });

        expect((await call('/series', child)).body).toHaveLength(1);
        expect((await call(`/series/${id}`, admin)).body).toMatchObject({
            age: 12,
            fileAge: null,
        });
        await call(`/series/${id}/classification`, admin, {
            method: 'PUT',
            json: { age: 14 },
        });
        expect((await call('/series', child)).body).toEqual([]);
    });
});

describe('online sheets', () => {
    const links = [
        { site: 'wikipedia', id: '123' },
        { site: 'manga-news', id: 'Spy-X-Family' },
    ];

    it('are kept on a series, one per site, and checked', async () => {
        const { id } = await series();
        const { body } = await call(`/series/${id}/classification`, admin, {
            method: 'PUT',
            json: { sources: links },
        });
        // Rangées par site : Manga-news, puis Wikipédia.
        expect(body.sources).toEqual([links[1], links[0]]);
        expect((await call(`/series/${id}`, admin)).body.sources).toEqual([
            links[1],
            links[0],
        ]);

        for (const bad of [
            { site: 'wikipedia', id: 'Gantz' },
            { site: 'manga-news', id: 'a/b' },
            { site: 'imdb', id: '1' },
        ]) {
            expect(
                (
                    await call(`/series/${id}/classification`, admin, {
                        method: 'PUT',
                        json: { sources: [bad] },
                    })
                ).status,
            ).toBe(400);
        }

        // Liste vide : plus de fiche.
        await call(`/series/${id}/classification`, admin, {
            method: 'PUT',
            json: { sources: [] },
        });
        expect((await call(`/series/${id}`, admin)).body.sources).toEqual([]);
    });

    it('chosen on a draft folder, go to its series when published', async () => {
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
                    formatId: await formatId('Manhwa'),
                    sources: [links[1]],
                },
            },
        );
        const drafts = (
            await call(`/libraries/${ctx.library.id}/drafts`, admin)
        ).body;
        expect(drafts[0].sources).toEqual([links[1]]);

        await ctx.files.publish(ctx.library.id, ['_draft/Solo/Solo T01.cbz']);

        const solo = (await call('/series', reader)).body.find(
            (s: { name: string }) => s.name === 'Solo',
        );
        expect((await call(`/series/${solo.id}`, admin)).body.sources).toEqual([
            links[1],
        ]);
    });
});

describe('credits', () => {
    it('lists the names already used, once each, for the admin', async () => {
        await writeCbz(ctx.file('Gantz/Gantz #01.cbz'), {
            comicInfo:
                '<Series>Gantz</Series><Number>1</Number><Writer>Hiroya Oku</Writer><Penciller>Hiroya Oku, Kei Ichiro</Penciller><Publisher>Tonkam</Publisher>',
        });
        await writeCbz(ctx.file('Gantz/Gantz #02.cbz'), {
            comicInfo:
                '<Series>Gantz</Series><Number>2</Number><Writer>HIROYA OKU</Writer><Publisher>Delcourt</Publisher>',
        });
        await ctx.scanner.scan(ctx.library.id);

        const path = `/libraries/${ctx.library.id}/credits`;
        expect((await call(path, reader)).status).toBe(403);
        expect((await call(path, admin)).body).toEqual({
            writers: ['Hiroya Oku'],
            pencillers: ['Hiroya Oku', 'Kei Ichiro'],
            publishers: ['Delcourt', 'Tonkam'],
        });
    });
});
