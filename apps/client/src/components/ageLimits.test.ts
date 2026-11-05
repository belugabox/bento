import { describe, expect, it } from 'vitest';

import {
    AGE_RATING_OPTIONS,
    ageLimitLabel,
    ageRatingLabel,
    canonicalRating,
} from './ageLimits';

describe('age groups', () => {
    it('offers one choice per age', () => {
        expect(AGE_RATING_OPTIONS.map((o) => o.label)).toEqual([
            'Tout public',
            '6 ans et +',
            '10 ans et +',
            '13 ans et +',
            '15 ans et +',
            '17 ans et +',
            '18 ans et +',
        ]);
    });

    it('groups the ComicInfo variants of the same age', () => {
        expect(ageRatingLabel('PG')).toBe('10 ans et +');
        expect(ageRatingLabel('Everyone 10+')).toBe('10 ans et +');
        expect(canonicalRating('PG')).toBe('Everyone 10+');
        expect(canonicalRating('G')).toBe('Everyone');
        expect(canonicalRating('X18+')).toBe('Adults Only 18+');
        expect(ageRatingLabel('M')).toBe('17 ans et +');
    });

    it('has no label for unknown ratings', () => {
        expect(ageRatingLabel('Unknown')).toBeNull();
        expect(canonicalRating(null)).toBeNull();
    });

    it('names age limits', () => {
        expect(ageLimitLabel(null)).toBe('Sans limite');
        expect(ageLimitLabel(10)).toBe('Jusqu’à 10 ans');
        expect(ageLimitLabel(12)).toBe('Jusqu’à 12 ans');
    });
});
