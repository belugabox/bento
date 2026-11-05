import { describe, expect, it } from 'vitest';

import {
    clampPage,
    doubleSpreads,
    moveForKey,
    moveForSide,
    moveForSwipe,
    navigationDirection,
    pagesToPreload,
    readingModeLabel,
    reversesSpreads,
    sideOfTap,
    singleSpreads,
    spreadIndexOf,
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

describe('sideOfTap', () => {
    it('splits the screen in thirds', () => {
        expect(sideOfTap(10, 300)).toBe('left');
        expect(sideOfTap(150, 300)).toBe('middle');
        expect(sideOfTap(290, 300)).toBe('right');
    });
});

describe('moveForSwipe', () => {
    it('turns the page when pushing it aside, following the direction', () => {
        expect(moveForSwipe(-120, 10, 'ltr')).toBe('next');
        expect(moveForSwipe(120, 10, 'ltr')).toBe('previous');
        expect(moveForSwipe(120, 10, 'rtl')).toBe('next');
        expect(moveForSwipe(-120, 10, 'rtl')).toBe('previous');
    });

    it('ignores short or mostly vertical moves', () => {
        expect(moveForSwipe(-30, 0, 'ltr')).toBeUndefined();
        expect(moveForSwipe(-80, 200, 'ltr')).toBeUndefined();
    });
});

describe('spreads', () => {
    const portrait: [number, number] = [20, 30];
    const wide: [number, number] = [40, 30];

    it('shows one page at a time in single mode', () => {
        expect(singleSpreads(3)).toEqual([[0], [1], [2]]);
    });

    it('keeps the cover alone and pairs the next pages', () => {
        expect(doubleSpreads([portrait, portrait, portrait, portrait])).toEqual(
            [[0], [1, 2], [3]],
        );
    });

    it('keeps merged double pages alone, and the page before them', () => {
        expect(
            doubleSpreads([portrait, portrait, wide, portrait, portrait]),
        ).toEqual([[0], [1], [2], [3, 4]]);
        expect(doubleSpreads([])).toEqual([]);
    });

    it('finds the spread of a page', () => {
        const spreads = [[0], [1, 2], [3]];
        expect(spreadIndexOf(spreads, 2)).toBe(1);
        expect(spreadIndexOf(spreads, 3)).toBe(2);
        expect(spreadIndexOf(spreads, 9)).toBe(0);
    });
});

describe('reading modes', () => {
    it('turns pages right to left only in right-to-left manga', () => {
        expect(navigationDirection('ltr')).toBe('ltr');
        expect(navigationDirection('ltr-manga')).toBe('ltr');
        expect(navigationDirection('rtl')).toBe('rtl');
    });

    it('puts the first page on the right for manga spreads', () => {
        expect(reversesSpreads('ltr')).toBe(false);
        expect(reversesSpreads('ltr-manga')).toBe(true);
        expect(reversesSpreads('rtl')).toBe(true);
    });

    it('names each mode', () => {
        expect(readingModeLabel('webtoon')).toBe(
            'Webtoon (défilement vertical)',
        );
    });
});
