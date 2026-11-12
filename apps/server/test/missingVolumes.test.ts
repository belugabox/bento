import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { series } from '../src/db/schema';
import { getSeries, listSeries } from '../src/library/catalog';
import { listManagedSeries } from '../src/library/management';
import { publishedCounts, volumesStatus } from '../src/library/missingVolumes';
import { sheetSeen } from '../src/library/sheets';
import { setup, writeCbz } from './helpers';

const volume = (number: string | null, kind = 'volume') => ({ kind, number });

const mn = (count: number) => ({ site: 'manga-news' as const, count });
const bdt = (count: number) => ({ site: 'bedetheque' as const, count });

describe('missing volumes', () => {
    it('lists the numbers absent from 1 to the last published volume', () => {
        expect(
            volumesStatus([volume('1'), volume('2'), volume('5')], [mn(7)]),
        ).toEqual({ published: mn(7), others: [], missing: [3, 4, 6, 7] });
        // Plus de tomes que la fiche n'en connaît : les trous seulement.
        expect(
            volumesStatus([volume('1'), volume('3')], [bdt(2)]).missing,
        ).toEqual([2]);
        // Sans fiche : les trous de la numérotation.
        expect(volumesStatus([volume('2'), volume('3')], [])).toEqual({
            published: null,
            others: [],
            missing: [1],
        });
        // Numéros non entiers : à part.
        expect(
            volumesStatus([volume('1'), volume('1.5')], [bdt(1)]).missing,
        ).toEqual([]);
    });

    it('says nothing for one-shots, or series with omnibus volumes', () => {
        expect(
            volumesStatus([volume(null, 'one-shot')], [mn(1)]).missing,
        ).toEqual([]);
        expect(
            volumesStatus([volume('1'), volume('1', 'integrale')], [mn(12)])
                .missing,
        ).toEqual([]);
    });

    it('keeps the sheet closest to the volumes of Bento when they disagree', () => {
        // Gantz en Perfect (18) : Bedetheque, pas Manga-news (édition normale).
        const perfect = Array.from({ length: 18 }, (_, i) =>
            volume(String(i + 1)),
        );
        expect(volumesStatus(perfect, [mn(37), bdt(18)])).toEqual({
            published: bdt(18),
            others: [mn(37)],
            missing: [],
        });
        // Une série incomplète : les deux sites d'accord.
        expect(
            volumesStatus([volume('1'), volume('2')], [mn(4), bdt(4)]),
        ).toEqual({ published: mn(4), others: [], missing: [3, 4] });
    });

    it('counts the specials of Bento in the Manga-news count, not in the Bedetheque one', () => {
        // Death Note : 12 tomes et « How to Read » (13e chez Manga-news).
        const deathNote = [
            ...Array.from({ length: 12 }, (_, i) => volume(String(i + 1))),
            volume('1', 'special'),
        ];
        expect(volumesStatus(deathNote, [mn(13)]).missing).toEqual([]);
        // Blacksad : Bedetheque compte ses hors-séries à part.
        const blacksad = [
            ...Array.from({ length: 6 }, (_, i) => volume(String(i + 1))),
            volume('1', 'hors-serie'),
        ];
        expect(volumesStatus(blacksad, [bdt(7)]).missing).toEqual([7]);
    });

    it('takes the published count of each linked sheet that gives one', () => {
        const sheets = new Map([
            ['manga-news:Gantz', { volumeCount: 37 }],
            ['bedetheque:500', { volumeCount: 18 }],
            ['bedetheque:600', { volumeCount: null }],
        ]);
        expect(
            publishedCounts(
                [
                    { site: 'bedetheque', id: '500' },
                    { site: 'manga-news', id: 'Gantz' },
                    { site: 'wikipedia', id: '7' },
                ],
                sheets,
            ),
        ).toEqual([mn(37), bdt(18)]);
        expect(
            publishedCounts([{ site: 'bedetheque', id: '600' }], sheets),
        ).toEqual([]);
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
            others: [],
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
            published: { site: 'manga-news', count: 6 },
            others: [],
            missing: [3, 5, 6],
        });
    });
});
