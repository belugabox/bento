import { describe, expect, it } from 'vitest';

import { cleanNames, creditSuggestions, fixCase } from './credits';

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

describe('cleaning the names of an online sheet', () => {
    it('puts family names in capitals back in normal case', () => {
        expect(fixCase('Hiroya OKU')).toBe('Hiroya Oku');
        expect(fixCase('Jean-Claude MÉZIÈRES')).toBe('Jean-Claude Mézières');
        expect(fixCase('Jeanne D’ARC')).toBe('Jeanne D’Arc');
        expect(fixCase('J. R. R. TOLKIEN')).toBe('J. R. R. Tolkien');
        // Tout en capitales : un nom de plume, gardé.
        expect(fixCase('CLAMP')).toBe('CLAMP');
        expect(fixCase('ONE')).toBe('ONE');
    });

    it('takes the spelling of a name already known, in any order', () => {
        const known = ['Hiroya Oku', 'Tatsuya Endō'];
        expect(cleanNames('Hiroya OKU, Oku Hiroya', known)).toBe('Hiroya Oku');
        expect(cleanNames('Tatsuya ENDO', known)).toBe('Tatsuya Endō');
        expect(cleanNames('Kei ICHIRO', known)).toBe('Kei Ichiro');
        expect(cleanNames(undefined, known)).toBe('');
    });
});
