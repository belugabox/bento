import { describe, expect, it } from 'vitest';

import {
    activityRows,
    bucketOf,
    calendarWeeks,
    hourGrid,
    monthLabel,
} from './statsData';

const row = (day: string, userId: number, minutes: number) => ({
    day,
    userId,
    seconds: minutes * 60,
    pages: 0,
});

describe('activity rows', () => {
    it('gives every day of a week, empty ones too, each reader apart', () => {
        const rows = activityRows(
            [
                row('2026-11-09', 1, 99), // avant la période
                row('2026-11-10', 1, 30),
                row('2026-11-10', 2, 15),
                row('2026-11-16', 1, 45),
            ],
            {
                period: '7d',
                start: '2026-11-09T12:00:00.000Z',
                today: '2026-11-16',
            },
        );
        expect(rows).toHaveLength(7);
        expect(rows[0]).toEqual({ label: 'mar. 10', 1: 30, 2: 15 });
        expect(rows[1]).toEqual({ label: 'mer. 11' });
        expect(rows.at(-1)).toEqual({ label: 'lun. 16', 1: 45 });
    });

    it('sums weeks over a year, months over everything', () => {
        expect(bucketOf('30d')).toBe('day');
        expect(bucketOf('12m')).toBe('week');
        expect(bucketOf('all')).toBe('month');
        const daily = [
            row('2026-11-10', 1, 30),
            row('2026-11-12', 1, 30),
            row('2026-11-16', 1, 10),
        ];
        const weeks = activityRows(daily, {
            period: '12m',
            start: '2025-11-16T12:00:00.000Z',
            today: '2026-11-16',
        });
        // Semaine du lundi 9 novembre, puis celle du 16.
        expect(weeks.slice(-2)).toEqual([
            { label: '9 nov.', 1: 60 },
            { label: '16 nov.', 1: 10 },
        ]);
        const months = activityRows([row('2026-09-30', 1, 5), ...daily], {
            period: 'all',
            start: '1970-01-01T00:00:00.000Z',
            today: '2026-11-16',
        });
        expect(months).toEqual([
            { label: 'sept. 26', 1: 5 },
            { label: 'oct. 26' },
            { label: 'nov. 26', 1: 70 },
        ]);
    });
});

describe('calendar', () => {
    it('lays out a year in weeks from Monday, darker for longer days', () => {
        const weeks = calendarWeeks(
            [
                row('2026-11-16', 1, 10),
                row('2026-11-16', 2, 50),
                row('2026-11-11', 1, 5),
                row('2026-11-12', 1, 20),
                row('2026-11-13', 1, 200),
            ],
            '2026-11-16',
        );
        expect(weeks).toHaveLength(53);
        const last = weeks.at(-1)!;
        // Lundi 16 : aujourd'hui (deux lecteurs) ; la suite est à venir.
        expect(last[0]).toEqual({ day: '2026-11-16', seconds: 3600, level: 3 });
        expect(last.slice(1)).toEqual([null, null, null, null, null, null]);
        const previous = weeks.at(-2)!;
        expect(previous.map((d) => d!.level)).toEqual([0, 0, 1, 2, 4, 0, 0]);
        expect(monthLabel(weeks[0]!, 0)).toBe('nov.');
    });
});

describe('hours', () => {
    it('starts the week on Monday', () => {
        const { grid, max } = hourGrid([
            { weekday: 0, hour: 20, seconds: 600 },
            { weekday: 1, hour: 7, seconds: 60 },
        ]);
        expect(grid[6]![20]).toBe(600);
        expect(grid[0]![7]).toBe(60);
        expect(max).toBe(600);
    });
});
