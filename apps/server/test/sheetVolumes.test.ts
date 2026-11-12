import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { Bedetheque, parseAlbums } from '../src/metadata/bedetheque';
import {
    Wikipedia,
    parseVolumeList,
    volumeListTitle,
} from '../src/metadata/wikipedia';

const fixture = (...parts: string[]) =>
    readFileSync(path.join(__dirname, 'fixtures', ...parts), 'utf-8');

describe('Bedetheque albums', () => {
    it('reads the number, title and year of each album', () => {
        const albums = parseAlbums(fixture('bedetheque', 'blacksad.html'));
        expect(albums.slice(0, 2)).toEqual([
            {
                kind: 'volume',
                number: 1,
                title: 'Quelque part entre les ombres',
                year: 2000,
            },
            { kind: 'volume', number: 2, title: 'Arctic-Nation', year: 2003 },
        ]);
        // Hors-séries à part, avec ou sans numéro.
        expect(albums.slice(7)).toEqual([
            {
                kind: 'hors-serie',
                number: null,
                title: "What's News",
                year: 2021,
            },
            {
                kind: 'hors-serie',
                number: 0,
                title: "Blacksad, les dessous de l'enquête",
                year: 2001,
            },
            {
                kind: 'hors-serie',
                number: 1,
                title: "L'histoire des aquarelles",
                year: 2005,
            },
        ]);
        // One shot : sans numéro.
        expect(
            parseAlbums(fixture('bedetheque', 'asterios-polyp.html')),
        ).toEqual([
            {
                kind: 'one-shot',
                number: null,
                title: 'Asterios Polyp',
                year: 2010,
            },
        ]);
    });

    it('asks for the page listing all the albums only when some are hidden', async () => {
        const urls: string[] = [];
        const site = new Bedetheque((async (url: string) => {
            urls.push(String(url));
            // Asterios Polyp : un album ; Blacksad : 10 montrés, et « Tout ».
            return new Response(
                fixture(
                    'bedetheque',
                    String(url).includes('25654')
                        ? 'asterios-polyp.html'
                        : 'blacksad.html',
                ),
            );
        }) as unknown as typeof fetch);

        expect(await site.volumes('500')).toHaveLength(10);
        expect(urls).toEqual([
            'https://www.bedetheque.com/serie_500.html',
            'https://www.bedetheque.com/serie-500-BD-Blacksad__10000.html',
        ]);

        urls.length = 0;
        expect(await site.volumes('25654')).toHaveLength(1);
        expect(urls).toEqual(['https://www.bedetheque.com/serie_25654.html']);
    });
});

describe('Wikipedia volume lists', () => {
    it('reads the French release year of each volume', () => {
        expect(
            parseVolumeList(fixture('wikipedia', 'gantz-volumes.wikitext')),
        ).toEqual([
            { kind: 'volume', number: 1, year: 2003 },
            { kind: 'volume', number: 2, year: 2003 },
            { kind: 'volume', number: 3, year: 2003 },
        ]);
        // Sans colonne en français : les numéros seuls.
        expect(
            parseVolumeList(
                '{{TomeBD/Entête\n | langue_1 = Japonais\n}}\n{{TomeBD\n | volume = 4\n | sortie_1 = {{date|1|mai|2001}}\n}}',
            ),
        ).toEqual([{ kind: 'volume', number: 4 }]);
    });

    it('finds the list page from the infobox', () => {
        expect(
            volumeListTitle(
                ' | nb_volumes = 37\n | liste_volumes       = Liste des chapitres de Gantz\n}}',
            ),
        ).toBe('Liste des chapitres de Gantz');
        expect(
            volumeListTitle(
                ' | liste_volumes = [[Liste des chapitres de X|la liste]]\n',
            ),
        ).toBe('Liste des chapitres de X');
        expect(volumeListTitle(' | nb_volumes = 2\n')).toBeUndefined();
    });

    it('follows the list page, and its parts when it is split', async () => {
        const asked: string[] = [];
        const wiki = (text: string) =>
            new Response(JSON.stringify({ parse: { wikitext: text } }));
        const site = new Wikipedia((async (url: URL) => {
            const page =
                url.searchParams.get('page') ??
                `id:${url.searchParams.get('pageid')}`;
            asked.push(page);
            return page === 'id:7'
                ? wiki(' | liste_volumes = Liste des chapitres de One Piece\n')
                : page === 'Liste des chapitres de One Piece'
                  ? wiki(fixture('wikipedia', 'one-piece-volumes.wikitext'))
                  : wiki(fixture('wikipedia', 'gantz-volumes.wikitext'));
        }) as unknown as typeof fetch);

        const volumes = await site.volumes(7);
        expect(asked.slice(0, 3)).toEqual([
            'id:7',
            'Liste des chapitres de One Piece',
            'Liste des chapitres de One Piece (1re partie)',
        ]);
        // Six parties, trois tomes chacune ici.
        expect(asked).toHaveLength(8);
        expect(volumes).toHaveLength(18);
    });
});
