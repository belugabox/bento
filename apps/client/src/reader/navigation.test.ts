import { describe, expect, it } from 'vitest';

import {
    clampPage,
    moveForKey,
    moveForSide,
    pagesToPreload,
} from './navigation';

describe('moveForSide', () => {
    it('goes forward on the left side when reading right to left', () => {
        expect(moveForSide('left', 'rtl')).toBe('next');
        expect(moveForSide('right', 'rtl')).toBe('previous');
    });

    it('goes forward on the right side when reading left to right', () => {
        expect(moveForSide('right', 'ltr')).toBe('next');
        expect(moveForSide('left', 'ltr')).toBe('previous');
    });
});

describe('moveForKey', () => {
    it('follows the reading direction for the arrows', () => {
        expect(moveForKey('ArrowLeft', 'rtl')).toBe('next');
        expect(moveForKey('ArrowLeft', 'ltr')).toBe('previous');
        expect(moveForKey('ArrowRight', 'ltr')).toBe('next');
    });

    it('always goes forward with space and page down', () => {
        expect(moveForKey(' ', 'rtl')).toBe('next');
        expect(moveForKey('PageDown', 'ltr')).toBe('next');
        expect(moveForKey('PageUp', 'rtl')).toBe('previous');
    });

    it('ignores other keys', () => {
        expect(moveForKey('a', 'rtl')).toBeUndefined();
    });
});

describe('clampPage', () => {
    it('keeps the page inside the volume', () => {
        expect(clampPage(-3, 10)).toBe(0);
        expect(clampPage(12, 10)).toBe(9);
        expect(clampPage(4.7, 10)).toBe(4);
        expect(clampPage(Number.NaN, 10)).toBe(0);
        expect(clampPage(5, 0)).toBe(0);
    });
});

describe('pagesToPreload', () => {
    it('preloads the next pages first, then the previous one', () => {
        expect(pagesToPreload(5, 20)).toEqual([6, 7, 8, 4]);
    });

    it('stays inside the volume', () => {
        expect(pagesToPreload(0, 2)).toEqual([1]);
        expect(pagesToPreload(1, 2)).toEqual([0]);
    });
});
