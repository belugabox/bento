import { describe, expect, it } from 'vitest';

import {
    formatNumber,
    formatRelative,
    formatSize,
    missingVolumesLabel,
    numbersLabel,
} from './format';

describe('format', () => {
    it('formats sizes', () => {
        expect(formatSize(512)).toBe('512 o');
        expect(formatSize(1536 * 1024)).toBe('1,5 Mo');
        expect(formatSize(250 * 1024 ** 3)).toBe('250 Go');
    });

    it('formats numbers with French separators', () => {
        expect(formatNumber(12345).replace(/\s/g, ' ')).toBe('12 345');
    });

    it('formats dates relative to now', () => {
        const now = Date.parse('2026-11-05T12:00:00Z');
        expect(formatRelative('2026-11-05T09:00:00Z', now)).toBe(
            'il y a 3 heures',
        );
        expect(formatRelative('2026-11-04T12:00:00Z', now)).toBe('hier');
        expect(formatRelative('2026-11-05T11:59:50Z', now)).toBe('à l’instant');
        expect(formatRelative(null, now)).toBe('jamais');
    });
});

describe('volume numbers', () => {
    it('groups the runs of three numbers or more', () => {
        expect(numbersLabel([12, 3, 7, 8, 9, 5, 6])).toBe('3, 5 à 9, 12');
        expect(numbersLabel([5, 6])).toBe('5, 6');
        expect(numbersLabel([4])).toBe('4');
        expect(missingVolumesLabel({ published: 14, missing: [7] })).toBe(
            'Tome manquant : 7 (14 parus)',
        );
        expect(missingVolumesLabel({ published: null, missing: [1, 2] })).toBe(
            'Tomes manquants : 1, 2',
        );
    });
});
