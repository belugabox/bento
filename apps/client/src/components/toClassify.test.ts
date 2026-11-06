import { describe, expect, it } from 'vitest';

import { nextToClassify, toClassify } from './toClassify';

const series = [
    { id: 1, name: 'Gantz', formatId: null, age: 16 },
    { id: 2, name: 'The Boxer', formatId: 1, age: null },
    { id: 3, name: 'Akira', formatId: null, age: null },
    { id: 4, name: 'Mashle', formatId: 1, age: 12 },
];

describe('toClassify', () => {
    it('keeps series without format or age, by name', () => {
        expect(toClassify(series).map((s) => s.name)).toEqual([
            'Akira',
            'The Boxer',
            'Gantz',
        ]);
    });

    it('goes to the next series by name, then back to the first', () => {
        const queue = toClassify(series);
        expect(nextToClassify(queue, series[2]!)?.name).toBe('The Boxer');
        expect(nextToClassify(queue, series[0]!)?.name).toBe('Akira');
        // Une série déjà classée (sortie de la liste) : la suivante par nom.
        expect(nextToClassify(queue, series[3]!)?.name).toBe('Akira');
        expect(nextToClassify([series[2]!], series[2]!)).toBeUndefined();
    });
});
