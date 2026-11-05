import { describe, expect, it } from 'vitest';

import {
    cleanWikitext,
    extractSummary,
    parseInfobox,
} from '../src/metadata/wikipedia';

// Extrait réel (simplifié) de l'article « Spy × Family ».
const SPY_FAMILY = `{{Infobox Animation et bande dessinée asiatiques/Entête
 | titre               = SPY×FAMILY
 | genre               = [[Film d'action|Action]], [[comédie]], [[techno-thriller]]
}}
{{Infobox Animation et bande dessinée asiatiques/Livre
 | format              = bd
 | auteur              = [[Tatsuya Endō]]
 | éditeur_francophone = [[Kurokawa]]
 | premier_volume      = {{date|25|mars|2019|en bande dessinée}}
 | dernier_volume      =
 | nb_volumes          = 17<ref>Shūeisha</ref>
}}
{{Infobox Animation et bande dessinée asiatiques/Livre
 | titre               = Spy × Family : Portrait de famille
 | nb_volumes          = 1
}}`;

describe('cleanWikitext', () => {
    it('keeps link labels and drops references', () => {
        expect(
            cleanWikitext("[[Film d'action|Action]], [[comédie]]<ref>x</ref>"),
        ).toBe('Action, comédie');
    });

    it('reads date and language templates', () => {
        expect(cleanWikitext('{{date|7|mars|2022|en bande dessinée}}')).toBe(
            '7 mars 2022',
        );
        expect(cleanWikitext('{{Langue|en|One Piece}}')).toBe('One Piece');
    });

    it('drops other, nested templates', () => {
        expect(cleanWikitext('Aventure {{nobr|{{x}} y}}')).toBe('Aventure');
    });
});

describe('parseInfobox', () => {
    it('reads genre, volumes and years of the first manga block', () => {
        expect(parseInfobox(SPY_FAMILY)).toEqual({
            genre: 'Action, comédie, techno-thriller',
            writer: 'Tatsuya Endō',
            penciller: 'Tatsuya Endō',
            publisher: 'Kurokawa',
            volumeCount: 17,
            firstYear: 2019,
            lastYear: undefined,
        });
    });

    it('reads the last volume year of a finished series', () => {
        const finished = SPY_FAMILY.replace(
            'dernier_volume      =',
            'dernier_volume      = {{date|7|mars|2022|en bande dessinée}}',
        );
        expect(parseInfobox(finished).lastYear).toBe(2022);
    });

    it('returns empty values without infobox', () => {
        expect(parseInfobox('Texte sans infobox')).toEqual({
            genre: '',
            writer: '',
            penciller: '',
            publisher: '',
            volumeCount: 0,
            firstYear: undefined,
            lastYear: undefined,
        });
    });
});

// Extrait réel (simplifié) de l'article « Blacksad ».
const BLACKSAD = `{{Infobox Bande dessinée
 | charte               = série
 | titre                = Blacksad
 | auteur               =
 | scénario             = [[Juan Díaz Canales]]
 | dessin               = [[Juanjo Guarnido]]
 | genre                = [[Roman noir|polar]], [[bande dessinée]] [[Anthropomorphisme|anthropomorphique]]
 | éditeur              = [[Dargaud]]
 | nombre d'albums      = 7 + 3 hors-série + 1 Blacksad Stories
 | première publication = [[2000 en bande dessinée|2000]]-[[2021 en bande dessinée|2021]]
}}`;

describe('parseInfobox (bande dessinée)', () => {
    it('reads authors, publisher, albums and years', () => {
        expect(parseInfobox(BLACKSAD)).toEqual({
            genre: 'Polar, bande dessinée anthropomorphique',
            writer: 'Juan Díaz Canales',
            penciller: 'Juanjo Guarnido',
            publisher: 'Dargaud',
            volumeCount: 7,
            firstYear: 2000,
            lastYear: 2021,
        });
    });

    it('treats a single year as an ongoing series', () => {
        const ongoing = BLACKSAD.replace(
            /première publication = .*/,
            'première publication = [[2019 en bande dessinée|2019]]',
        );
        expect(parseInfobox(ongoing)).toMatchObject({
            firstYear: 2019,
            lastYear: undefined,
        });
    });
});

describe('extractSummary', () => {
    it('cleans references and Japanese transcriptions', () => {
        const html = `<div class="mw-parser-output">
            <h2>Synopsis<span class="mw-editsection">modifier</span></h2>
            <p>La paix entre Ostania (<span>東国（オスタニア）</span>, <i>Osutania</i>?) et Westalis est fragile<sup class="reference">[1]</sup>.</p>
            <p>Twilight&#160;: un espion.</p>
        </div>`;
        expect(extractSummary(html)).toBe(
            'La paix entre Ostania et Westalis est fragile.\n\nTwilight : un espion.',
        );
    });

    it('keeps only the first paragraphs of a long synopsis', () => {
        const paragraph = `<p>${'a'.repeat(300)}</p>`;
        const summary = extractSummary(paragraph.repeat(5));
        expect(summary.split('\n\n')).toHaveLength(2);
    });

    it('ignores empty paragraphs', () => {
        expect(extractSummary('<p> </p><p>Texte</p>')).toBe('Texte');
    });
});
