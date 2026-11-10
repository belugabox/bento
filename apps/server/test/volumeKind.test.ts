import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseVolumeFileName } from '../src/archive/fileName';
import { getSeries, listSeries } from '../src/library/catalog';
import { publicationPathOf, volumeNumberOf } from '../src/library/paths';
import { volumeNumbering } from '../src/library/volumeKind';
import { setup, writeCbz } from './helpers';

describe('special volumes', () => {
    it('are read in file names', () => {
        expect(parseVolumeFileName('Gantz HS01 (2010)')).toEqual({
            series: 'Gantz',
            number: '1',
            kind: 'hors-serie',
            year: 2010,
        });
        expect(parseVolumeFileName('Gantz Hors-série 2')).toMatchObject({
            number: '2',
            kind: 'hors-serie',
        });
        expect(parseVolumeFileName('Gantz.SP.03')).toMatchObject({
            series: 'Gantz',
            number: '3',
            kind: 'special',
        });
        expect(parseVolumeFileName('Gantz Spécial 1')).toMatchObject({
            kind: 'special',
        });
        // Un tome normal, et une série qui commence par « Sp ».
        expect(parseVolumeFileName('Spy x Family T05')).toEqual({
            series: 'Spy x Family',
            number: '5',
            year: undefined,
        });
    });

    it('take their kind from Format, a prefixed number, or the file name', () => {
        expect(volumeNumbering({ Format: 'Hors-série', Number: '2' })).toEqual({
            kind: 'hors-serie',
            number: '2',
        });
        expect(volumeNumbering({ Number: 'SP01' })).toEqual({
            kind: 'special',
            number: '1',
        });
        expect(
            volumeNumbering(
                { Number: '1' },
                { kind: 'hors-serie', number: '1' },
            ),
        ).toEqual({ kind: 'hors-serie', number: '1' });
        // Un autre Format (« TPB ») : un tome.
        expect(volumeNumbering({ Format: 'TPB', Number: '3' })).toEqual({
            kind: 'volume',
            number: '3',
        });
    });

    it('are published as Series HSNN and Series SPNN', () => {
        expect(
            publicationPathOf({
                Series: 'Gantz',
                Number: '1',
                Format: 'Hors-série',
                Year: 2010,
            }),
        ).toBe('Gantz/Gantz HS01 (2010).cbz');
        expect(publicationPathOf({ Series: 'Gantz', Number: 'SP2' })).toBe(
            'Gantz/Gantz SP02.cbz',
        );
        // Chaque type a sa numérotation.
        expect(volumeNumberOf('Gantz HS01 (2010).cbz')).toBe('HS1');
        expect(volumeNumberOf('Gantz SP01.cbz')).toBe('SP1');
        expect(volumeNumberOf('Gantz #01 (2010).cbz')).toBe('1');
    });
});

describe('scanning special volumes', () => {
    let ctx: Awaited<ReturnType<typeof setup>>;
    beforeEach(async () => {
        ctx = await setup();
    });
    afterEach(async () => {
        await ctx.cleanup();
    });

    it('puts them after the volumes, each kind with its numbers', async () => {
        await writeCbz(ctx.file('Gantz/Gantz HS01.cbz'), {
            comicInfo:
                '<Series>Gantz</Series><Number>1</Number><Format>Hors-série</Format>',
        });
        await writeCbz(ctx.file('Gantz/Gantz SP01.cbz'), {
            comicInfo: '<Series>Gantz</Series><Number>SP01</Number>',
        });
        await writeCbz(ctx.file('Gantz/Gantz #02.cbz'), {
            comicInfo: '<Series>Gantz</Series><Number>2</Number>',
        });
        await writeCbz(ctx.file('Gantz/Gantz #01.cbz'), {
            comicInfo: '<Series>Gantz</Series><Number>1</Number>',
        });
        await ctx.scanner.scan(ctx.library.id);

        const viewer = { id: 0, role: 'admin' as const, maxAge: null };
        const [gantz] = listSeries(ctx.db, viewer);
        const { volumes } = getSeries(ctx.db, viewer, gantz!.id);
        expect(volumes.map((v) => [v.kind, v.number])).toEqual([
            ['volume', '1'],
            ['volume', '2'],
            ['hors-serie', '1'],
            ['special', '1'],
        ]);
        // « 2 tomes » : hors-série et spécial à part.
        expect(gantz).toMatchObject({ volumeCount: 2, readCount: 0 });

        // Une série de spéciaux seulement : ils sont comptés.
        await writeCbz(ctx.file('Guides/Guides SP01.cbz'), {
            comicInfo: '<Series>Guides</Series><Number>SP01</Number>',
        });
        await ctx.scanner.scan(ctx.library.id);
        expect(
            listSeries(ctx.db, viewer).find((s) => s.name === 'Guides'),
        ).toMatchObject({ volumeCount: 1 });
    });
});

describe('one-shots and omnibus volumes', () => {
    it('are named by Format, a prefixed number or the file name', () => {
        expect(volumeNumbering({ Format: 'One-shot' })).toEqual({
            kind: 'one-shot',
            number: undefined,
        });
        expect(volumeNumbering({ Format: 'Intégrale', Number: '2' })).toEqual({
            kind: 'integrale',
            number: '2',
        });
        expect(volumeNumbering({ Number: 'INT01' })).toEqual({
            kind: 'integrale',
            number: '1',
        });
        expect(parseVolumeFileName('Origin INT02 (2020)')).toMatchObject({
            series: 'Origin',
            number: '2',
            kind: 'integrale',
        });
        expect(parseVolumeFileName('Origin Intégrale 1')).toMatchObject({
            kind: 'integrale',
            number: '1',
        });
        // « Intégrale 10 tomes » : le nombre de tomes, pas un numéro.
        expect(
            parseVolumeFileName('Origin [Intégrale 10 tomes]').kind,
        ).toBeUndefined();
    });

    it('are published without number, or as Series INTNN', () => {
        expect(
            publicationPathOf({
                Series: 'Spirale',
                Format: 'One-shot',
                Number: '1',
                Year: 2021,
            }),
        ).toBe('Spirale/Spirale (2021).cbz');
        expect(
            publicationPathOf({ Series: 'Spirale', Format: 'One-shot' }),
        ).toBe('Spirale/Spirale.cbz');
        expect(
            publicationPathOf({
                Series: 'Origin',
                Format: 'Intégrale',
                Number: '2',
            }),
        ).toBe('Origin/Origin INT02.cbz');
        expect(volumeNumberOf('Origin INT02.cbz')).toBe('INT2');
        // Intégrale sans numéro : comme un one-shot.
        expect(
            publicationPathOf({
                Series: 'Amer béton',
                Format: 'Intégrale',
                Year: 2007,
            }),
        ).toBe('Amer béton/Amer béton (2007).cbz');
    });

    describe('in the library', () => {
        let ctx: Awaited<ReturnType<typeof setup>>;
        beforeEach(async () => {
            ctx = await setup();
        });
        afterEach(async () => {
            await ctx.cleanup();
        });

        it('count as volumes of the series', async () => {
            await writeCbz(ctx.file('Spirale/Spirale.cbz'), {
                comicInfo: '<Series>Spirale</Series><Format>One-shot</Format>',
            });
            for (const n of [1, 2]) {
                await writeCbz(ctx.file(`Origin/Origin INT0${n}.cbz`), {
                    comicInfo: `<Series>Origin</Series><Number>INT0${n}</Number>`,
                });
            }
            await writeCbz(ctx.file('Origin/Origin HS01.cbz'), {
                comicInfo: '<Series>Origin</Series><Number>HS01</Number>',
            });
            await ctx.scanner.scan(ctx.library.id);

            const viewer = { id: 0, role: 'admin' as const, maxAge: null };
            const list = listSeries(ctx.db, viewer);
            expect(list.find((s) => s.name === 'Spirale')).toMatchObject({
                volumeCount: 1,
                volumeKinds: 'one-shot',
            });
            const origin = list.find((s) => s.name === 'Origin')!;
            // Les intégrales comptent, le hors-série non.
            expect(origin).toMatchObject({
                volumeCount: 2,
                volumeKinds: 'integrale',
            });
            expect(
                getSeries(ctx.db, viewer, origin.id).volumes.map((v) => [
                    v.kind,
                    v.number,
                ]),
            ).toEqual([
                ['integrale', '1'],
                ['integrale', '2'],
                ['hors-serie', '1'],
            ]);
        });
    });
});
