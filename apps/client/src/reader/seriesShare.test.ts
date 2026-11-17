import { describe, expect, it } from 'vitest';

import { seriesPercent, volumeShare } from './seriesShare';

const volumes = [
    { id: 1, pageCount: 100, progress: { page: 99, completed: true } },
    { id: 2, pageCount: 100, progress: { page: 49, completed: false } },
    { id: 3, pageCount: 200, progress: null },
];

describe('series progress', () => {
    it('counts read volumes in full and started ones up to their page', () => {
        expect(volumes.map((v) => volumeShare(v))).toEqual([1, 0.5, 0]);
        expect(seriesPercent(volumes)).toBe(37);
    });

    it('follows the page shown in the open volume', () => {
        const current = { id: 3, page: 99 };
        expect(volumeShare(volumes[2]!, current)).toBe(0.5);
        expect(seriesPercent(volumes, current)).toBe(62);
        // Relu : reste lu.
        expect(volumeShare(volumes[0]!, { id: 1, page: 0 })).toBe(1);
    });

    it('never goes back below the saved page', () => {
        expect(volumeShare(volumes[1]!, { id: 2, page: 10 })).toBe(0.5);
    });

    it('is zero without pages', () => {
        expect(seriesPercent([])).toBe(0);
    });
});
