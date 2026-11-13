import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseVolumeFileName } from '../src/archive/fileName';
import { getSeries, getVolume, listSeries } from '../src/library/catalog';
import { groupSortKey } from '../src/library/groupSort';
import { listManagedSeries } from '../src/library/management';
import { publicationPathOf } from '../src/library/publication';
import { setup, writeCbz } from './helpers';

const ADMIN = { id: 0, role: 'admin' as const, maxAge: null };

describe('groups of volumes in file names', () => {
    it('reads the group as written, and the series without it', () => {
        expect(
            parseVolumeFileName(
                'Pokémon - La Grande Aventure (Part 1) - Rouge, Bleu et Jaune T02 (Kusaka-Mato) (2014) [Digital-1920] [Manga FR] (PapriKa+)',
            ),
        ).toEqual({
            series: 'Pokémon - La Grande Aventure',
            group: 'Part 1 - Rouge, Bleu et Jaune',
            number: '2',
            year: 2014,
        });
        expect(
            parseVolumeFileName('Ippo - Saison 6 - The Fighting T01'),
        ).toMatchObject({ series: 'Ippo', group: 'Saison 6 - The Fighting' });
        // Le nom publié par Bento se relit pareil.
        expect(
            parseVolumeFileName(
                'Pokémon - La Grande Aventure - Part 4b - Emeraude #03 (2017)',
            ),
        ).toMatchObject({
            series: 'Pokémon - La Grande Aventure',
            group: 'Part 4b - Emeraude',
            number: '3',
        });
        // Sans groupement : rien de changé.
        expect(parseVolumeFileName('Spy X Family T05 (2021)')).toEqual({
            series: 'Spy X Family',
            number: '5',
            year: 2021,
        });
    });

    it('publishes each group with its own numbering, without clashes', () => {
        expect(
            publicationPathOf({
                Series: 'Pokémon - La Grande Aventure',
                StoryArc: 'Part 2 - Or et Argent',
                Number: '1',
                Year: 2016,
            }),
        ).toBe(
            'Pokémon - La Grande Aventure/Pokémon - La Grande Aventure - Part 2 - Or et Argent #01 (2016).cbz',
        );
        // Hors-séries groupés par thème.
        expect(
            publicationPathOf({
                Series: 'Gantz',
                StoryArc: 'Guides',
                Number: '1',
                Format: 'Hors-série',
            }),
        ).toBe('Gantz/Gantz - Guides HS01.cbz');
        expect(publicationPathOf({ Series: 'Gantz', Number: '1' })).toBe(
            'Gantz/Gantz #01.cbz',
        );
    });

    it('sorts the groups in natural order', () => {
        const groups = ['Part 10', 'Part 2', 'Part 4b', 'Part 4a', 'Émeraude'];
        expect(
            [...groups].sort((a, b) =>
                groupSortKey(a).localeCompare(groupSortKey(b)),
            ),
        ).toEqual(['Émeraude', 'Part 2', 'Part 4a', 'Part 4b', 'Part 10']);
    });
});

describe('a series in groups', () => {
    let ctx: Awaited<ReturnType<typeof setup>>;

    beforeEach(async () => {
        ctx = await setup();
        const volume = (group: string, number: string, format = '') =>
            `<Series>Pokémon</Series><StoryArc>${group}</StoryArc><Number>${number}</Number>${format && `<Format>${format}</Format>`}`;
        // Noms de fichiers dans un ordre trompeur : le groupement compte.
        await writeCbz(ctx.file('Pokémon/a.cbz'), {
            comicInfo: volume('Part 2 - Or et Argent', '1'),
        });
        await writeCbz(ctx.file('Pokémon/b.cbz'), {
            comicInfo: volume('Part 1 - Rouge, Bleu et Jaune', '2'),
        });
        await writeCbz(ctx.file('Pokémon/c.cbz'), {
            comicInfo: volume('Part 1 - Rouge, Bleu et Jaune', '1'),
        });
        await writeCbz(ctx.file('Pokémon/d.cbz'), {
            comicInfo: volume('Part 10 - Soleil et Lune', '1'),
        });
        await writeCbz(ctx.file('Pokémon/e.cbz'), {
            comicInfo: volume('Guides', '1', 'Hors-série'),
        });
        await ctx.scanner.scan(ctx.library.id);
    });

    afterEach(async () => {
        await ctx.cleanup();
    });

    it('orders the volumes group by group, then by number, and reads on from one group to the next', () => {
        const [pokemon] = listSeries(ctx.db, ADMIN);
        const { volumes } = getSeries(ctx.db, ADMIN, pokemon!.id);
        expect(volumes.map((v) => `${v.group} ${v.number}`)).toEqual([
            'Part 1 - Rouge, Bleu et Jaune 1',
            'Part 1 - Rouge, Bleu et Jaune 2',
            'Part 2 - Or et Argent 1',
            'Part 10 - Soleil et Lune 1',
            // Les hors-séries après les tomes, avec leur groupe.
            'Guides 1',
        ]);
        // Fin du premier groupe : le suivant.
        const last = getVolume(ctx.db, ADMIN, volumes[1]!.id);
        expect(last.nextId).toBe(volumes[2]!.id);
        expect(getVolume(ctx.db, ADMIN, volumes[2]!.id).previousId).toBe(
            volumes[1]!.id,
        );
    });

    it('counts no missing volume when the volumes are grouped', () => {
        expect(listManagedSeries(ctx.db)[0]!.volumesStatus.missing).toEqual([]);
    });
});
