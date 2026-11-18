import { describe, expect, it } from 'vitest';

import { guessSeriesName, safeFolderName } from '../src/library/draftNames';

describe('guessSeriesName', () => {
    it('keeps the series name of a folder or file received per volume', () => {
        expect(guessSeriesName('_draft/Gantz T01 [Team]')).toBe('Gantz');
        expect(guessSeriesName('_draft/One.Piece.Vol.12')).toBe('One Piece');
        expect(guessSeriesName('_draft/Dr. Stone - Tome 3 (2019)')).toBe(
            'Dr Stone',
        );
        expect(guessSeriesName('_draft/Spy x Family #05.cbz')).toBe(
            'Spy x Family',
        );
        expect(guessSeriesName('_draft/Gantz 03')).toBe('Gantz');
        expect(guessSeriesName('_draft/Spirale.cbz')).toBe('Spirale');
    });

    it('makes a usable folder name', () => {
        expect(safeFolderName('Gantz: G?')).toBe('Gantz G');
    });
});
