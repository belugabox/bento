import { describe, expect, it } from 'vitest';

import {
    type VolumeWithProgress,
    nextToRead,
    progressRatio,
    volumeLabel,
    volumeTitleOf,
} from './readingStatus';

const volume = (
    id: number,
    progress: VolumeWithProgress['progress'] = null,
): VolumeWithProgress => ({
    id,
    number: String(id),
    title: null,
    pageCount: 10,
    progress,
});

const done = { page: 9, completed: true };

describe('nextToRead', () => {
    it('starts with the first volume', () => {
        expect(nextToRead([volume(1), volume(2)])).toMatchObject({
            volume: { id: 1 },
            action: 'start',
        });
    });

    it('resumes the first unfinished volume', () => {
        expect(
            nextToRead([
                volume(1, done),
                volume(2, { page: 3, completed: false }),
                volume(3),
            ]),
        ).toMatchObject({ volume: { id: 2 }, action: 'resume' });
    });

    it('goes on with the next volume after a finished one', () => {
        expect(nextToRead([volume(1, done), volume(2)])).toMatchObject({
            volume: { id: 2 },
            action: 'start',
        });
    });

    it('offers to reread when everything is read', () => {
        expect(nextToRead([volume(1, done), volume(2, done)])).toMatchObject({
            volume: { id: 1 },
            action: 'reread',
        });
        expect(nextToRead([])).toBeUndefined();
    });
});

describe('progressRatio', () => {
    it('counts the page reached, and a read volume as complete', () => {
        expect(progressRatio(volume(1))).toBe(0);
        expect(progressRatio(volume(1, { page: 4, completed: false }))).toBe(
            0.5,
        );
        expect(progressRatio(volume(1, { page: 0, completed: true }))).toBe(1);
    });
});

describe('volumeLabel', () => {
    it('uses the number, else the title', () => {
        expect(volumeLabel({ number: '12', title: 'X' })).toBe('Tome 12');
        expect(volumeLabel({ number: null, title: 'Bonus' })).toBe('Bonus');
        expect(volumeLabel({ number: null, title: null })).toBe('Hors-série');
    });
});

describe('volumeTitleOf', () => {
    it('gives the title of a volume, unless it repeats its number', () => {
        expect(volumeTitleOf({ number: '3', title: 'La Tour' })).toBe(
            'La Tour',
        );
        expect(volumeTitleOf({ number: '3', title: 'Tome 3' })).toBeNull();
        expect(volumeTitleOf({ number: '3', title: 'Vol. 03' })).toBeNull();
        expect(volumeTitleOf({ number: '03', title: 'Tome 3' })).toBeNull();
        expect(volumeTitleOf({ number: '01.5', title: 'Tome 1.5' })).toBeNull();
        expect(
            volumeTitleOf({ number: '12.5', title: 'Tome 12.5' }),
        ).toBeNull();
        expect(volumeTitleOf({ number: '12.5', title: 'Tome 1205' })).toBe(
            'Tome 1205',
        );
        // Sans numéro, le titre sert déjà de libellé.
        expect(volumeTitleOf({ number: null, title: 'Bonus' })).toBeNull();
        expect(volumeTitleOf({ number: '1', title: null })).toBeNull();
    });
});
