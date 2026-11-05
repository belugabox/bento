import { access, rm, utimes, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getSeries, listSeries } from '../src/library/catalog';
import { coverFile, seriesKeyOf } from '../src/library/scanner';
import { setup, writeCbz } from './helpers';

// Les listes dépendent de la personne : ici un admin sans compte, qui voit tout.
const NO_USER = { id: 0, role: 'admin' as const, maxAge: null };

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
    ctx = await setup();
});

afterEach(async () => {
    await ctx.cleanup();
});

const exists = (file: string) =>
    access(file).then(
        () => true,
        () => false,
    );

describe('LibraryScanner', () => {
    it('indexes series and volumes with their metadata and covers', async () => {
        await writeCbz(ctx.file('Spy x Family/Spy x Family #2.cbz'), {
            pages: 3,
            comicInfo: '<Series>Spy x Family</Series><Number>2</Number>',
        });
        await writeCbz(ctx.file('Spy x Family/Spy x Family #1.cbz'), {
            comicInfo:
                '<Series>Spy x Family</Series><Number>1</Number><Summary>Un espion.</Summary><Genre>Comédie</Genre><AgeRating>Everyone 10+</AgeRating><Year>2019</Year>',
        });

        const result = await ctx.scanner.scan(ctx.library.id);

        expect(result).toEqual({
            added: 2,
            updated: 0,
            removed: 0,
            errors: [],
        });
        const [series] = listSeries(ctx.db, NO_USER);
        expect(series).toMatchObject({ name: 'Spy x Family', volumeCount: 2 });
        const details = getSeries(ctx.db, NO_USER, series!.id);
        expect(details).toMatchObject({
            summary: 'Un espion.',
            genre: 'Comédie',
            ageRating: 'Everyone 10+',
            year: 2019,
            library: { type: 'manga' },
        });
        expect(details.volumes.map((v) => [v.number, v.pageCount])).toEqual([
            ['1', 2],
            ['2', 3],
        ]);
        for (const volume of details.volumes) {
            expect(await exists(coverFile(ctx.coversPath, volume.id))).toBe(
                true,
            );
        }
    });

    it('sorts volumes by number, using the file name without ComicInfo', async () => {
        for (const name of ['T10', 'T2', 'T2.5', 'Bonus']) {
            await writeCbz(ctx.file(`Gantz/Gantz ${name}.cbz`));
        }

        await ctx.scanner.scan(ctx.library.id);

        const [series] = listSeries(ctx.db, NO_USER);
        expect(series?.name).toBe('Gantz');
        expect(
            getSeries(ctx.db, NO_USER, series!.id).volumes.map((v) => v.number),
        ).toEqual(['2', '2.5', '10', null]);
    });

    it('ignores drafts and hidden folders', async () => {
        await writeCbz(ctx.file('_draft/Gantz/Gantz T01.cbz'));
        await writeCbz(ctx.file('.trash/Old T01.cbz'));
        await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));

        const result = await ctx.scanner.scan(ctx.library.id);

        expect(result.added).toBe(1);
    });

    it('only rereads changed files and forgets deleted ones', async () => {
        await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));
        await writeCbz(ctx.file('Gantz/Gantz T02.cbz'));
        await writeCbz(ctx.file('Spirale/Spirale T01.cbz'));
        await ctx.scanner.scan(ctx.library.id);

        expect(await ctx.scanner.scan(ctx.library.id)).toEqual({
            added: 0,
            updated: 0,
            removed: 0,
            errors: [],
        });

        await writeCbz(ctx.file('Gantz/Gantz T02.cbz'), { pages: 5 });
        // Même seconde possible : forcer une date de modification différente.
        await utimes(
            ctx.file('Gantz/Gantz T02.cbz'),
            new Date(),
            new Date(Date.now() + 5000),
        );
        await rm(ctx.file('Spirale/Spirale T01.cbz'));

        const result = await ctx.scanner.scan(ctx.library.id);

        expect(result).toMatchObject({ updated: 1, removed: 1 });
        // Série vide supprimée.
        expect(listSeries(ctx.db, NO_USER).map((s) => s.name)).toEqual([
            'Gantz',
        ]);
    });

    it('keeps every series that still has volumes', async () => {
        // Ids croisés : la série 2 n'a aucun tome dont l'id vaut 2.
        await writeCbz(ctx.file('A/A T01.cbz'));
        await writeCbz(ctx.file('A/A T02.cbz'));
        await writeCbz(ctx.file('A/A T03.cbz'));
        await writeCbz(ctx.file('B/B T01.cbz'));
        await writeCbz(ctx.file('C/C T01.cbz'));
        await ctx.scanner.scan(ctx.library.id);
        await rm(ctx.file('C/C T01.cbz'));

        await ctx.scanner.scan(ctx.library.id);

        expect(
            listSeries(ctx.db, NO_USER).map((s) => [s.name, s.volumeCount]),
        ).toEqual([
            ['A', 3],
            ['B', 1],
        ]);
    });

    it('reports unreadable archives and keeps going', async () => {
        await writeFile(ctx.file('broken.cbz'), 'not a zip');
        await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));

        const result = await ctx.scanner.scan(ctx.library.id);

        expect(result.added).toBe(1);
        expect(result.errors).toEqual([
            {
                file: 'broken.cbz',
                reason: "Archive illisible : ce n'est pas une archive ZIP",
            },
        ]);
    });

    it('runs one scan at a time per library', async () => {
        await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));

        const [first, second] = await Promise.all([
            ctx.scanner.scan(ctx.library.id),
            ctx.scanner.scan(ctx.library.id),
        ]);

        expect(second).toBe(first);
        expect(first.added).toBe(1);
    });
});

describe('seriesKeyOf', () => {
    it('uses the top-level folder', () => {
        expect(seriesKeyOf('Gantz/Extras/Gantz T01.cbz')).toBe('Gantz');
    });

    it('uses the ComicInfo series, then the file name, at the root', () => {
        expect(seriesKeyOf('x.cbz', 'Spirale')).toBe('Spirale');
        expect(seriesKeyOf('Spirale T01 (2021).cbz')).toBe('Spirale');
        expect(seriesKeyOf('Oneshot.cbz')).toBe('Oneshot');
    });
});
