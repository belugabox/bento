import { describe, expect, it } from 'vitest';

import { nameVariant, sameSeriesName } from '../src/metadata/seriesNames';

describe('series names from one site to another', () => {
    it('are the same despite case, accents, articles, « et », « & » and « × »', () => {
        expect(
            sameSeriesName('Gloutons et Dragons', 'Gloutons & Dragons'),
        ).toBe(true);
        expect(sameSeriesName('Spy × Family', 'Spy X Family')).toBe(true);
        expect(sameSeriesName('Sculpteur (le)', 'Le Sculpteur')).toBe(true);
        expect(
            sameSeriesName(
                'Combats du Dieu R-X (les)',
                'Les Combats du Dieu R-X',
            ),
        ).toBe(true);
        expect(sameSeriesName('Coq de combat', 'COQ DE COMBAT')).toBe(true);
        expect(sameSeriesName('Gantz', 'Gantz G')).toBe(false);
        expect(sameSeriesName('Coq de combat', 'Combats')).toBe(false);
    });

    it('offer the other spelling of « et » and « & »', () => {
        expect(nameVariant('Gloutons et Dragons')).toBe('Gloutons & Dragons');
        expect(nameVariant('Gloutons & Dragons')).toBe('Gloutons et Dragons');
        expect(nameVariant('Gantz')).toBeUndefined();
    });
});
