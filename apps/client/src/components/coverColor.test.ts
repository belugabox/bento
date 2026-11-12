import { describe, expect, it } from 'vitest';

import { dominantColor, rgba } from './coverColor';

/** Pixels RVBA : `count` fois chaque couleur. */
const pixels = (...colors: [number, number, number, number][]) =>
    colors.flatMap(([r, g, b, count]) =>
        Array.from({ length: count }, () => [r, g, b, 255]).flat(),
    );

describe('cover colour', () => {
    it('takes the most present vivid hue, not the white or black', () => {
        expect(
            dominantColor(
                pixels(
                    [255, 255, 255, 500],
                    [0, 0, 0, 300],
                    [220, 40, 60, 100],
                    [40, 80, 200, 40],
                ),
            ),
        ).toEqual([220, 40, 60]);
    });

    it('falls back to the average of a black and white image', () => {
        expect(
            dominantColor(pixels([200, 200, 200, 2], [100, 100, 100, 2])),
        ).toEqual([150, 150, 150]);
        expect(dominantColor([])).toBeNull();
    });

    it('writes a CSS colour', () => {
        expect(rgba([220, 40, 60], 0.3)).toBe('rgba(220, 40, 60, 0.3)');
    });
});
