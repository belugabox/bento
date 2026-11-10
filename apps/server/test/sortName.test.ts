import { describe, expect, it } from 'vitest';

import { articleFirst, compareNames, sortKeyOf } from '../src/library/sortName';

describe('sortKeyOf', () => {
    it('ignores a leading article', () => {
        expect(sortKeyOf('Le Petit Prince')).toBe('Petit Prince');
        expect(sortKeyOf('Les Vieux Fourneaux')).toBe('Vieux Fourneaux');
        expect(sortKeyOf("L'Attaque des Titans")).toBe('Attaque des Titans');
        expect(sortKeyOf('L’Arabe du futur')).toBe('Arabe du futur');
        expect(sortKeyOf('The Promised Neverland')).toBe('Promised Neverland');
        expect(sortKeyOf('A Silent Voice')).toBe('Silent Voice');
        expect(sortKeyOf('Une sœur')).toBe('sœur');
    });

    it('keeps names that only look like an article', () => {
        expect(sortKeyOf('Lastman')).toBe('Lastman');
        expect(sortKeyOf('Akira')).toBe('Akira');
        expect(sortKeyOf('Lanfeust de Troy')).toBe('Lanfeust de Troy');
        expect(sortKeyOf('Le')).toBe('Le');
        expect(sortKeyOf('Theodore Poussin')).toBe('Theodore Poussin');
    });
});

describe('articleFirst', () => {
    it('puts back an article written after the name', () => {
        expect(articleFirst('Boxer (The)')).toBe('The Boxer');
        expect(articleFirst('Petit Prince (Le)')).toBe('Le Petit Prince');
        // Article en minuscules : une majuscule une fois devant.
        expect(articleFirst('Sculpteur (le)')).toBe('Le Sculpteur');
        expect(articleFirst("Attaque des Titans (L')")).toBe(
            "L'Attaque des Titans",
        );
        expect(articleFirst('Promised Neverland, The')).toBe(
            'The Promised Neverland',
        );
    });

    it('leaves other names alone', () => {
        expect(articleFirst('The Boxer')).toBe('The Boxer');
        expect(articleFirst('Gantz (Perfect)')).toBe('Gantz (Perfect)');
        expect(articleFirst('Tintin (Le Lotus bleu)')).toBe(
            'Tintin (Le Lotus bleu)',
        );
    });
});

describe('compareNames', () => {
    it('sorts without articles, accents and case', () => {
        expect(
            [
                'Le Petit Prince',
                'Zelda',
                "L'Attaque des Titans",
                'astérix',
                'The Boys',
                'Boxer (The)',
                'Blacksad',
                'Gantz 10',
                'Gantz 2',
            ].sort(compareNames),
        ).toEqual([
            'astérix',
            "L'Attaque des Titans",
            'Blacksad',
            'Boxer (The)',
            'The Boys',
            'Gantz 2',
            'Gantz 10',
            'Le Petit Prince',
            'Zelda',
        ]);
    });
});
