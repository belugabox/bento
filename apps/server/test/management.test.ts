import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;

const get = async (path: string, cookie: string) => {
    const response = await api.request(path, { headers: { Cookie: cookie } });
    return { status: response.status, body: await response.json() };
};

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
    for (const n of [1, 2]) {
        await writeCbz(ctx.file(`Gantz/Gantz T0${n}.cbz`), { pages: 3 });
    }
    await writeCbz(ctx.file('Spirale/Spirale.cbz'), {
        pages: 5,
        comicInfo: '<Series>Spirale</Series><Format>One-shot</Format>',
    });
    await ctx.scanner.scan(ctx.library.id);
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('series management', () => {
    it('lists every series with its size, pages and what it lacks', async () => {
        const admin = sessionCookie(ctx.db, 'admin', 'admin');
        const { status, body } = await get('/manage/series', admin);

        expect(status).toBe(200);
        expect(body.map((s: { name: string }) => s.name)).toEqual([
            'Gantz',
            'Spirale',
        ]);
        const gantz = body[0];
        expect(gantz).toMatchObject({
            volumeCount: 2,
            pageCount: 6,
            formatId: null,
            hasSummary: false,
        });
        // Comme l'éditeur : le numéro et l'année des ComicInfo.
        expect(gantz.completeness.missing).toContain('Numéro de 2 tomes');
        expect(gantz.size).toBeGreaterThan(0);
        // Un one-shot n'a pas de numéro à donner : compté comme numéroté.
        expect(body[1].volumeCount).toBe(1);
        expect(body[1].completeness.missing).not.toContainEqual(
            expect.stringMatching(/^Numéro/),
        );
        expect(gantz.coverVolumeId).toBeTypeOf('number');
        // Sans format ni âge : les deux sont à classer.
        expect((await get('/manage/series/to-classify', admin)).body).toEqual({
            count: 2,
        });
    });

    it('reads the fields like the editor: the first volume that has one', async () => {
        // Tome 1 sans auteur ni genre ; le tome 2 les a.
        await writeCbz(ctx.file('Gantz/Gantz T01.cbz'), {
            comicInfo: '<Series>Gantz</Series><Number>1</Number>',
        });
        await writeCbz(ctx.file('Gantz/Gantz T02.cbz'), {
            comicInfo:
                '<Series>Gantz</Series><Number>2</Number><Writer>Hiroya Oku</Writer><Penciller>Hiroya Oku</Penciller><Publisher>Delcourt</Publisher><Genre>Action</Genre>',
        });
        await ctx.scanner.scan(ctx.library.id);
        const admin = sessionCookie(ctx.db, 'admin', 'admin');
        const [gantz] = (await get('/manage/series', admin)).body;

        expect(gantz.completeness.missing).not.toContain('Scénario');
        expect(gantz.completeness.missing).not.toContain('Dessin');
        expect(gantz.completeness.missing).not.toContain('Éditeur');
        expect(gantz.completeness.missing).not.toContain('Genres');
        // La série elle-même prend aussi la première valeur remplie.
        expect(gantz).toMatchObject({
            writer: 'Hiroya Oku',
            publisher: 'Delcourt',
            genres: ['Action'],
        });
    });

    it('is for the admin only', async () => {
        const reader = sessionCookie(ctx.db, 'reader', 'alice');
        expect((await get('/manage/series', reader)).status).toBe(403);
        expect((await get('/manage/series/to-classify', reader)).status).toBe(
            403,
        );
    });
});
