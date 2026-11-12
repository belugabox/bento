import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { getSeries, listSeries } from '../src/library/catalog';
import { listManagedSeries } from '../src/library/management';
import { parsePeriod, periodText } from '../src/metadata/period';
import {
    authDeps,
    formatDrafts,
    sessionCookie,
    setup,
    silent,
    writeCbz,
} from './helpers';

const ADMIN = { id: 0, role: 'admin' as const, maxAge: null };

describe('period of a series', () => {
    it('is read from « 2000 », « 2000 – 2013 » or « 2000-2013 »', () => {
        expect(parsePeriod('2000')).toEqual({ start: 2000, end: null });
        expect(parsePeriod(' 2000 – 2013 ')).toEqual({
            start: 2000,
            end: 2013,
        });
        expect(parsePeriod('2000-2013')).toEqual({ start: 2000, end: 2013 });
        expect(parsePeriod('')).toEqual({ start: null, end: null });
        // Pas une période : texte, fin avant le début, trois années.
        expect(parsePeriod('années 2000')).toBeNull();
        expect(parsePeriod('2013 – 2000')).toBeNull();
        expect(parsePeriod('2000 2005 2010')).toBeNull();
    });

    it('is written « 2000 – 2013 », or « 2000 » while running', () => {
        expect(periodText({ start: 2000, end: 2013 })).toBe('2000 – 2013');
        expect(periodText({ start: 2019, end: null })).toBe('2019');
        expect(periodText({ start: 2019, end: 2019 })).toBe('2019');
        expect(periodText({ start: null, end: null })).toBe('');
    });
});

describe('period kept in Bento', () => {
    let ctx: Awaited<ReturnType<typeof setup>>;
    let api: ReturnType<typeof createApi>;

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
        await writeCbz(ctx.file('Gantz/Gantz T01.cbz'), {
            comicInfo:
                '<Series>Gantz</Series><Number>1</Number><Year>2003</Year>',
        });
        await ctx.scanner.scan(ctx.library.id);
    });

    afterEach(async () => {
        await ctx.cleanup();
    });

    const put = (path: string, body: unknown) =>
        api.request(path, {
            method: 'PUT',
            headers: {
                Cookie: sessionCookie(ctx.db, 'admin'),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

    it('counts in the completeness, instead of the year of each volume', async () => {
        const [gantz] = listSeries(ctx.db, ADMIN);
        // Sans parution : l'année du premier tome, et « Parution » manque.
        expect(gantz).toMatchObject({ year: 2003, endYear: null });
        expect(listManagedSeries(ctx.db)[0]!.completeness.missing).toContain(
            'Parution',
        );

        const saved = await put(`/series/${gantz!.id}/classification`, {
            startYear: 2000,
            endYear: 2013,
        });
        expect(await saved.json()).toMatchObject({
            startYear: 2000,
            endYear: 2013,
        });
        expect(getSeries(ctx.db, ADMIN, gantz!.id)).toMatchObject({
            startYear: 2000,
            endYear: 2013,
        });
        // L'accueil montre la parution.
        expect(listSeries(ctx.db, ADMIN)[0]).toMatchObject({
            year: 2000,
            endYear: 2013,
        });
        const { missing } = listManagedSeries(ctx.db)[0]!.completeness;
        expect(missing).not.toContain('Parution');
        // L'année des tomes ne compte plus.
        expect(missing.some((m) => m.startsWith('Année'))).toBe(false);

        expect(
            (
                await put(`/series/${gantz!.id}/classification`, {
                    startYear: 1500,
                })
            ).status,
        ).toBe(400);
    });

    it('goes from a draft folder to its series when published', async () => {
        await writeCbz(ctx.file('_draft/Spirale/Spirale T01.cbz'), {
            comicInfo: '<Series>Spirale</Series><Number>1</Number>',
        });
        const drafts = await put(
            `/libraries/${ctx.library.id}/drafts/classification`,
            { folder: '_draft/Spirale', startYear: 1998, endYear: 1999 },
        );
        expect(await drafts.json()).toMatchObject({
            startYear: 1998,
            endYear: 1999,
        });
        expect((await ctx.files.drafts(ctx.library.id))[0]).toMatchObject({
            startYear: 1998,
            endYear: 1999,
        });

        await formatDrafts(ctx);
        await ctx.files.publish(ctx.library.id, [
            '_draft/Spirale/Spirale T01.cbz',
        ]);
        const spirale = listSeries(ctx.db, ADMIN).find(
            (s) => s.name === 'Spirale',
        )!;
        expect(getSeries(ctx.db, ADMIN, spirale.id)).toMatchObject({
            startYear: 1998,
            endYear: 1999,
        });
    });
});
