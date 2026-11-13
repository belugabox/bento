import { describe, expect, it } from 'vitest';

import {
    type VolumeWithProgress,
    countedVolumes,
    nextToRead,
    progressRatio,
    seriesVolumesLabel,
    volumeCountLabel,
    volumeLabel,
    volumeShortLabel,
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

    it('names hors-séries and specials', () => {
        expect(
            volumeLabel({ number: '1', title: null, kind: 'hors-serie' }),
        ).toBe('Hors-série 1');
        expect(volumeLabel({ number: '2', title: null, kind: 'special' })).toBe(
            'Spécial 2',
        );
        expect(
            volumeTitleOf({ number: '1', title: 'Hors-série 1' }),
        ).toBeNull();
        expect(volumeTitleOf({ number: '1', title: 'HS 01' })).toBeNull();
        // Sans numéro ni titre : le nom de son type.
        expect(
            volumeLabel({ number: null, title: null, kind: 'special' }),
        ).toBe('Spécial');
    });
});

describe('countedVolumes', () => {
    it('leaves out hors-séries and specials, unless there are only those', () => {
        expect(
            countedVolumes([{ kind: 'volume' }, { kind: 'special' }]),
        ).toEqual([{ kind: 'volume' }]);
        expect(countedVolumes([{ kind: 'special' }])).toEqual([
            { kind: 'special' },
        ]);
    });
});

describe('volumeCountLabel', () => {
    it('counts each kind apart', () => {
        expect(
            volumeCountLabel([
                ...Array.from({ length: 12 }, () => ({
                    kind: 'volume' as const,
                })),
                { kind: 'special' },
            ]),
        ).toBe('12 tomes · 1 spécial');
        expect(
            volumeCountLabel([
                {},
                { kind: 'hors-serie' },
                { kind: 'hors-serie' },
            ]),
        ).toBe('1 tome · 2 hors-séries');
    });
});

describe('volumeShortLabel', () => {
    it('fits a narrow card', () => {
        expect(volumeShortLabel({ number: '12', title: null })).toBe('T12');
        expect(
            volumeShortLabel({ number: '1', title: null, kind: 'hors-serie' }),
        ).toBe('HS1');
        expect(volumeShortLabel({ number: null, title: 'Bonus' })).toBe(
            'Bonus',
        );
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

describe('one-shots and omnibus volumes', () => {
    it('are labelled without number for a one-shot', () => {
        const oneShot = {
            number: '1',
            title: 'One-shot',
            kind: 'one-shot' as const,
        };
        expect(volumeLabel(oneShot)).toBe('One-shot');
        expect(volumeShortLabel(oneShot)).toBe('One-shot');
        expect(volumeTitleOf(oneShot)).toBeNull();
        expect(
            volumeLabel({ number: '2', title: null, kind: 'integrale' }),
        ).toBe('Intégrale 2');
        expect(
            volumeShortLabel({ number: '2', title: null, kind: 'integrale' }),
        ).toBe('INT2');
        // Intégrale sans numéro : comme un one-shot.
        const whole = {
            number: null,
            title: 'Amer béton',
            kind: 'integrale' as const,
        };
        expect(volumeLabel(whole)).toBe('Intégrale');
        expect(volumeCountLabel([whole])).toBe('Intégrale');
    });

    it('are counted with the series', () => {
        expect(volumeCountLabel([{ kind: 'one-shot' }])).toBe('One-shot');
        expect(
            volumeCountLabel([
                { kind: 'integrale' },
                { kind: 'integrale' },
                { kind: 'hors-serie' },
            ]),
        ).toBe('2 intégrales · 1 hors-série');
        expect(
            countedVolumes([{ kind: 'integrale' }, { kind: 'special' }]),
        ).toEqual([{ kind: 'integrale' }]);
        expect(seriesVolumesLabel(1, 'one-shot')).toBe('One-shot');
        expect(seriesVolumesLabel(1, 'integrale')).toBe('Intégrale');
        expect(seriesVolumesLabel(3, 'integrale')).toBe('3 intégrales');
        expect(seriesVolumesLabel(12, 'volume,integrale')).toBe('12 tomes');
        expect(seriesVolumesLabel(1, null)).toBe('1 tome');
    });
});

describe('volume in a group', () => {
    it('says the group before the volume, not on a narrow card', () => {
        const volume = {
            number: '1',
            title: null,
            group: 'Part 1 - Rouge, Bleu et Jaune',
        };
        expect(volumeLabel(volume)).toBe(
            'Part 1 - Rouge, Bleu et Jaune · Tome 1',
        );
        expect(volumeShortLabel(volume)).toBe('T1');
        expect(volumeLabel({ ...volume, group: null })).toBe('Tome 1');
    });
});
