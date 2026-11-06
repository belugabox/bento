import { describe, expect, it } from 'vitest';

import { type CompletenessInput, completenessOf } from './completeness';

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
