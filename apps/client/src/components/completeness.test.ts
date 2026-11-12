import { describe, expect, it } from 'vitest';

import {
    type CompletenessInput,
    completenessOf,
    fieldsFromVolumes,
} from './completeness';

const FULL: CompletenessInput = {
    name: 'Gantz',
    hasFormat: true,
    hasAge: true,
    hasStatus: true,
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

    it('lists what is missing, volumes counted by share', () => {
        const { percent, missing } = completenessOf({
            ...FULL,
            hasFormat: false,
            summary: '  ',
            volumes: [
                { number: '1', year: null },
                { number: '2', year: null },
                { number: '3', year: 2002 },
                { number: '4', year: 2003 },
            ],
        });
        expect(missing).toEqual(['Format', 'Résumé', 'Année de 2 tomes']);
        // 7 champs, tous les numéros, la moitié des années : 8,5 sur 11.
        expect(percent).toBe(77);
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
                    { number: '1000', year: null },
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
        // Dessin, éditeur, résumé et années absents : pas comptés.
        expect(completenessOf({ ...fields, ...full }).missing).toEqual([
            'Dessin',
            'Éditeur',
            'Résumé',
            'Année de 2 tomes',
        ]);
    });
});
