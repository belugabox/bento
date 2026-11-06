import { describe, expect, it } from 'vitest';

import { creditSuggestions } from './credits';

const names = ['Hiroya Oku', 'Kazuo Koike', 'Kurokawa', 'Kurokawa Éditions'];

describe('creditSuggestions', () => {
    it('completes the last name typed, without case or accents', () => {
        expect(creditSuggestions(names, 'kuro')).toEqual([
            'Kurokawa',
            'Kurokawa Éditions',
        ]);
        expect(creditSuggestions(names, 'editions')).toEqual([
            'Kurokawa Éditions',
        ]);
        // Nom déjà complet, ou rien de tapé : pas de suggestion.
        expect(creditSuggestions(names, 'Kurokawa Éditions')).toEqual([]);
        expect(creditSuggestions(names, '')).toEqual([]);
    });

    it('keeps the names before, and skips them', () => {
        expect(creditSuggestions(names, 'Hiroya Oku, k')).toEqual([
            'Hiroya Oku, Kazuo Koike',
            'Hiroya Oku, Kurokawa',
            'Hiroya Oku, Kurokawa Éditions',
        ]);
        expect(creditSuggestions(names, 'Hiroya Oku, oku')).toEqual([]);
    });
});
