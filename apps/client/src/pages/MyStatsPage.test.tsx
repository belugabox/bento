import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MyStatsPage } from './MyStatsPage';

const SHEET = {
    id: 2,
    name: 'Alice',
    avatarSeed: null,
    role: 'reader',
    seconds: 600,
    pages: 30,
    sessions: 1,
    days: 1,
    completed: 1,
    lastReadAt: '2026-11-15T21:00:00.000Z',
    averageSessionSeconds: 600,
    pagesPerMinute: 3,
    streaks: { current: 1, best: 1 },
    genres: [],
    formats: [],
    series: [],
    history: [],
    start: '2026-10-17T12:00:00.000Z',
    daily: [],
    hours: [],
};

const recap = (year: number) => ({
    user: { id: 2, name: 'Alice', avatarSeed: null },
    year,
    years: [2026, 2025],
    seconds: year === 2026 ? 6000 : 1200,
    pages: 145,
    sessions: 3,
    longestSessionSeconds: 3600,
    days: 3,
    bestStreak: 2,
    completed: 2,
    topSeries: [
        {
            id: 3,
            name: 'Gantz',
            seconds: 5400,
            coverUpdatedAt: null,
            coverVolumeId: 10,
            coverVolumeVersion: 1,
        },
        {
            id: 4,
            name: 'Kids',
            seconds: 600,
            coverUpdatedAt: null,
            coverVolumeId: 11,
            coverVolumeVersion: 1,
        },
    ],
    seriesCount: 2,
    newSeries: 1,
    finished: [{ id: 3, name: 'Gantz' }],
    genres: [
        { name: 'Action', seconds: 5400 },
        { name: 'Aventure', seconds: 600 },
    ],
    busiestMonth: { month: `${year}-01`, seconds: 5400 },
    favouriteMoment: { weekday: 4, hour: 0, seconds: 3600 },
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MyStatsPage', () => {
    it('shows my reading, then the recap of a year', async () => {
        const requests: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            requests.push(url);
            const body = url.startsWith('/api/stats/me/year')
                ? recap(url.includes('year=2025') ? 2025 : 2026)
                : SHEET;
            return new Response(JSON.stringify(body), {
                headers: { 'Content-Type': 'application/json' },
            });
        });

        render(
            <MantineProvider>
                <MemoryRouter>
                    <MyStatsPage />
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(
            await screen.findByRole('heading', { name: 'Mes statistiques' }),
        ).toBeTruthy();
        expect(await screen.findByText('Pages par minute')).toBeTruthy();
        expect(requests[0]).toMatch(/^\/api\/stats\/me\?period=30d&tz=/);

        fireEvent.click(screen.getByRole('tab', { name: 'Bilan de l’année' }));
        expect(await screen.findByText('Série de l’année 2026')).toBeTruthy();
        expect(requests.at(-1)).toMatch(/^\/api\/stats\/me\/year\?tz=-?\d+$/);
        expect(screen.getAllByText('Gantz').length).toBeGreaterThan(0);
        expect(screen.getByText('le jeudi vers 0 h')).toBeTruthy();
        expect(screen.getByText(/puis Aventure/)).toBeTruthy();
        expect(screen.getByText('janvier')).toBeTruthy();
        expect(screen.getByText(/1 nouvelle série/)).toBeTruthy();
        expect(screen.getByText('Séries terminées (1)')).toBeTruthy();

        // Autre année.
        fireEvent.click(screen.getByRole('textbox', { name: 'Année' }));
        fireEvent.click(await screen.findByRole('option', { name: '2025' }));
        expect(await screen.findByText('Série de l’année 2025')).toBeTruthy();
        expect(requests.at(-1)).toMatch(/year=2025/);
    });
});
