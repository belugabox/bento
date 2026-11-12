import { describe, expect, it } from 'vitest';

import {
    type CompletenessInput,
    completenessOf,
    fieldsFromVolumes,
    missingHint,
} from './completeness';

const FULL: CompletenessInput = {
    name: 'Gantz',
    hasFormat: true,
    hasAge: true,
    hasStatus: true,
    hasRating: true,
    hasPeriod: true,
    genreCount: 2,
    writer: 'Hiroya Oku',
    penciller: 'Hiroya Oku',
    publisher: 'Tonkam',
    summary: 'Des aliens.',
    volumes: [
        { number: '1', year: 2000 },
        { number: '2', year: 2001 },
    ],
};

describe('completenessOf', () => {
    it('is complete when everything is filled', () => {
        expect(completenessOf(FULL)).toEqual({ percent: 100, missing: [] });
    });

    it('counts the readers rating from the online sheets', () => {
        const { percent, missing } = completenessOf({
            ...FULL,
            hasRating: false,
        });
        expect(missing).toEqual(['Note']);
        expect(percent).toBeLessThan(100);
    });

    it('lists what is missing, volume numbers counted by share', () => {
        const { percent, missing } = completenessOf({
            ...FULL,
            hasFormat: false,
            summary: '  ',
            volumes: [
                { number: '1', year: null },
                { number: '2', year: null },
                { number: null, year: 2002 },
                { number: '4', year: 2003 },
            ],
        });
        expect(missing).toEqual(['Format', 'Résumé', 'Numéro de 1 tome']);
        // 9 champs sur 11 (parution comprise), trois numéros sur quatre :
        // 9,75 sur 12.
        expect(percent).toBe(81);
    });

    it('asks for the period of the series, not the year of each volume', () => {
        const { missing } = completenessOf({
            ...FULL,
            hasPeriod: false,
            volumes: [{ number: '1', year: null }],
        });
        expect(missing).toEqual(['Parution']);
    });

    it('never rounds up to 100 %', () => {
        expect(
            completenessOf({
                ...FULL,
                volumes: [
                    ...Array.from({ length: 999 }, () => ({
                        number: '1',
                        year: 2000,
                    })),
                    { number: null, year: null },
                ],
            }).percent,
        ).toBe(99);
    });
});

describe('fieldsFromVolumes', () => {
    const full = {
        hasFormat: true,
        hasAge: true,
        hasStatus: true,
        hasRating: true,
        hasPeriod: true,
        genreCount: 1,
    };

    it('does not ask a one-shot for a number', () => {
        const fields = fieldsFromVolumes([
            {
                Series: 'Asterios Polyp',
                Format: 'One-shot',
                Year: 2010,
                Writer: 'David Mazzucchelli',
                Penciller: 'David Mazzucchelli',
                Publisher: 'Casterman',
                Summary: 'Un architecte…',
            },
        ]);
        expect(completenessOf({ ...fields, ...full })).toEqual({
            percent: 100,
            missing: [],
        });
    });

    it('takes the first filled value of each field, never a missing one', () => {
        const fields = fieldsFromVolumes([
            { Series: 'Gantz', Number: '1' },
            { Series: 'Gantz', Number: '2', Writer: 'Hiroya Oku' },
        ]);
        expect(fields).toMatchObject({
            name: 'Gantz',
            writer: 'Hiroya Oku',
            penciller: undefined,
            publisher: undefined,
        });
        // Dessin, éditeur et résumé absents : pas comptés.
        expect(completenessOf({ ...fields, ...full }).missing).toEqual([
            'Dessin',
            'Éditeur',
            'Résumé',
        ]);
    });
});

describe('missingHint', () => {
    it('says how to fill what is missing', () => {
        expect(missingHint('Note')).toMatch(/Manga-news ou Bedetheque/);
        expect(missingHint('Parution')).toMatch(/Wikipédia/);
        expect(missingHint('Format')).toMatch(/éditeur/);
        expect(missingHint('Résumé')).toMatch(/Remplir/);
    });
});
