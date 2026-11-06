import { describe, expect, it } from 'vitest';

import {
    ageLimitLabel,
    ageLimitOptions,
    ageOptions,
    seriesAgeOf,
} from './ageLimits';

describe('age grid', () => {
    it('offers the ages of the grid, and the current one if outside', () => {
        expect(ageOptions([0, 8, 12]).map((o) => o.label)).toEqual([
            'Tout public',
            '8+',
            '12+',
        ]);
        expect(ageOptions([0, 12], 13).map((o) => o.value)).toEqual([
            '0',
            '12',
            '13',
        ]);
    });

    it('prefers the age chosen in Bento to the one of the files', () => {
        expect(seriesAgeOf({ age: 12, fileAge: 13 })).toBe(12);
        expect(seriesAgeOf({ age: null, fileAge: 13 })).toBe(13);
        expect(seriesAgeOf({ age: null, fileAge: null })).toBeNull();
    });

    it('offers account limits from the grid, no limit first', () => {
        expect(ageLimitOptions([0, 12, 16]).map((o) => o.label)).toEqual([
            'Sans limite',
            'Tout public uniquement',
            'Jusqu’à 12 ans',
            'Jusqu’à 16 ans',
        ]);
    });

    it('names age limits', () => {
        expect(ageLimitLabel(null)).toBe('Sans limite');
        expect(ageLimitLabel(10)).toBe('Jusqu’à 10 ans');
        expect(ageLimitLabel(12)).toBe('Jusqu’à 12 ans');
    });
});
