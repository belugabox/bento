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
    });
});
