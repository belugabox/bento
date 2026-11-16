import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderStatsPage } from './ReaderStatsPage';

const series = (
    id: number,
    name: string,
    read: number,
    volumes: number,
    state: string,
) => ({
    id,
    name,
    read,
    volumes,
    seconds: 3600,
    lastReadAt: '2026-11-15T21:00:00.000Z',
    state,
});

const history = Array.from({ length: 25 }, (_, i) => ({
    seriesId: 3,
    seriesName: 'Gantz',
    volumeId: 100 + i,
    number: String(i + 1),
    kind: 'volume',
    page: 4,
    pageCount: 200,
    completed: i > 0,
    updatedAt: '2026-11-15T21:00:00.000Z',
    seconds: i === 0 ? 900 : 0,
}));

const SHEET = {
    id: 2,
    name: 'Alice',
    role: 'reader',
    seconds: 7200,
    pages: 480,
    sessions: 4,
    days: 3,
    completed: 6,
    lastReadAt: '2026-11-15T21:00:00.000Z',
    averageSessionSeconds: 1800,
    pagesPerMinute: 4.5,
    streaks: { current: 2, best: 5 },
    genres: [
        { name: 'Action', seconds: 5000 },
        { name: 'Comédie', seconds: 2200 },
    ],
    formats: [{ name: 'Manga', seconds: 7200 }],
    series: [
        series(3, 'Gantz', 6, 37, 'reading'),
        series(4, 'Kids', 2, 2, 'finished'),
        series(5, 'Vieux', 1, 10, 'abandoned'),
    ],
    history,
    start: '2026-10-17T12:00:00.000Z',
    daily: [{ day: '2026-11-15', userId: 2, seconds: 7200, pages: 480 }],
    hours: [],
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ReaderStatsPage', () => {
    it('shows the figures, series and history of one reader', async () => {
        const requests: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            requests.push(String(input));
            return new Response(JSON.stringify(SHEET), {
                headers: { 'Content-Type': 'application/json' },
            });
        });

        render(
            <MantineProvider>
                <MemoryRouter initialEntries={['/stats/readers/2?period=7d']}>
                    <Routes>
                        <Route
                            path="/stats/readers/:id"
                            element={<ReaderStatsPage />}
                        />
                    </Routes>
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(
            await screen.findByRole('heading', { name: 'Alice' }),
        ).toBeTruthy();
        expect(requests[0]).toMatch(/^\/api\/stats\/readers\/2\?period=7d&tz=/);
        expect(screen.getByText('30 min en moyenne')).toBeTruthy();
        expect(screen.getByText('4,5')).toBeTruthy();
        expect(
            screen.getByText(/record : 5 · 3 jours de lecture/),
        ).toBeTruthy();
        expect(screen.getByLabelText('Action : 1,4 h')).toBeTruthy();
        // Séries rangées par état.
        expect(screen.getByText('En cours (1)')).toBeTruthy();
        expect(screen.getByText('Terminées (1)')).toBeTruthy();
        expect(screen.getByText('Abandonnées (1)')).toBeTruthy();
        expect(
            screen.getByLabelText('Gantz : 6 tomes lus sur 37'),
        ).toBeTruthy();
        // Retour à la page générale, même période.
        expect(
            screen
                .getByRole('link', { name: /Statistiques/ })
                .getAttribute('href'),
        ).toBe('/stats?period=7d');

        // Historique : 20 lignes, puis tout.
        expect(screen.getByText(/p\. 5\/200 · 15 min/)).toBeTruthy();
        expect(screen.queryByText(/· Tome 25/)).toBeNull();
        fireEvent.click(screen.getByText('Tout afficher (25)'));
        expect(screen.getByText(/· Tome 25/)).toBeTruthy();
    });
});
