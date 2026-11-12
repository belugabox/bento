import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { series } from '../src/db/schema';
import { getSeries, listSeries } from '../src/library/catalog';
import { listManagedSeries } from '../src/library/management';
import { publishedCount, volumesStatus } from '../src/library/missingVolumes';
import { sheetSeen } from '../src/library/sheets';
import { setup, writeCbz } from './helpers';

const volume = (number: string | null, kind = 'volume') => ({ kind, number });

describe('missing volumes', () => {
    it('lists the numbers absent from 1 to the last published volume', () => {
        expect(
            volumesStatus([volume('1'), volume('2'), volume('5')], 7),
        ).toEqual({ published: 7, missing: [3, 4, 6, 7] });
        // Plus de tomes que la fiche n'en connaît : les trous seulement.
        expect(volumesStatus([volume('1'), volume('3')], 2)).toEqual({
            published: 2,
            missing: [2],
        });
        // Sans fiche : les trous de la numérotation.
        expect(volumesStatus([volume('2'), volume('3')], null)).toEqual({
            published: null,
            missing: [1],
        });
        // Hors-séries et numéros non entiers : à part.
        expect(
            volumesStatus(
                [volume('1'), volume('1', 'hors-serie'), volume('1.5')],
                1,
            ),
        ).toEqual({ published: 1, missing: [] });
    });

    it('says nothing for one-shots, or series with omnibus volumes', () => {
        expect(volumesStatus([volume(null, 'one-shot')], 1).missing).toEqual(
            [],
        );
        expect(
            volumesStatus([volume('1'), volume('1', 'integrale')], 12).missing,
        ).toEqual([]);
    });

    it('takes the published count from Manga-news, then Bedetheque', () => {
        const sheets = new Map([
            ['manga-news:Gantz', { volumeCount: 37 }],
            ['bedetheque:500', { volumeCount: 40 }],
            ['bedetheque:600', { volumeCount: 12 }],
        ]);
        expect(
            publishedCount(
                [
                    { site: 'bedetheque', id: '500' },
                    { site: 'manga-news', id: 'Gantz' },
                ],
                sheets,
            ),
        ).toBe(37);
        expect(
            publishedCount([{ site: 'bedetheque', id: '600' }], sheets),
        ).toBe(12);
        expect(
            publishedCount([{ site: 'wikipedia', id: '7' }], sheets),
        ).toBeNull();
    });
});

describe('missing volumes of a series', () => {
    let ctx: Awaited<ReturnType<typeof setup>>;
    const ADMIN = { id: 0, role: 'admin' as const, maxAge: null };

    beforeEach(async () => {
        ctx = await setup();
    });
    afterEach(async () => {
        await ctx.cleanup();
    });

    it('follows the volume count of its sheet, each time the sheet is read', async () => {
        for (const n of ['1', '2', '4']) {
            await writeCbz(ctx.file(`Gantz/Gantz T0${n}.cbz`), {
                comicInfo: `<Series>Gantz</Series><Number>${n}</Number>`,
            });
        }
        await ctx.scanner.scan(ctx.library.id);
        ctx.db.update(series).set({ sources: 'manga-news:Gantz' }).run();
        const [gantz] = listSeries(ctx.db, ADMIN);
        expect(listManagedSeries(ctx.db)[0]!.volumesStatus).toEqual({
            published: null,
            missing: [3],
        });
        // Réservé à l'admin (page Séries) : pas sur la fiche série.
        expect(getSeries(ctx.db, ADMIN, gantz!.id)).not.toHaveProperty(
            'volumesStatus',
        );

        sheetSeen(ctx.db, 'manga-news', 'Gantz', {
            title: 'Gantz',
            volumeCount: 6,
            writer: '',
            penciller: '',
            publisher: '',
            summary: '',
        });
        expect(listManagedSeries(ctx.db)[0]!.volumesStatus).toEqual({
            published: 6,
            missing: [3, 5, 6],
        });
    });
});
