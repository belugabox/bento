import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StatsPage } from './StatsPage';

const STATS = {
    libraries: [
        {
            id: 1,
            name: 'Mangas',
            type: 'manga',
            lastScanAt: null,
            series: 3,
            volumes: 40,
            pages: 8000,
            size: 2 * 1024 ** 3,
        },
    ],
    ratings: [
        { minAge: null, series: 2 },
        { minAge: 10, series: 1 },
    ],
    statuses: { ongoing: 1, completed: 1, unknown: 1 },
    readers: [
        {
            id: 2,
            name: 'Alice',
            role: 'reader',
            maxAge: 10,
            lastLoginAt: null,
            completed: 5,
            inProgress: 1,
            lastReadAt: null,
        },
    ],
    recent: [],
    topSeries: [],
    pendingDrafts: 4,
};

const READING = {
    start: '2026-10-17T12:00:00.000Z',
    daily: [{ day: '2026-11-15', userId: 2, seconds: 5400, pages: 300 }],
    hours: [{ weekday: 0, hour: 20, seconds: 5400 }],
    readers: [
        {
            id: 2,
            name: 'Alice',
            avatarSeed: 'alice-seed',
            role: 'reader',
            seconds: 5400,
            pages: 300,
            sessions: 3,
            days: 1,
            completed: 2,
            lastReadAt: '2026-11-15T21:00:00.000Z',
        },
        {
            id: 1,
            name: 'Ben',
            role: 'admin',
            seconds: 0,
            pages: 0,
            sessions: 0,
            days: 0,
            completed: 0,
            lastReadAt: null,
        },
    ],
};

const respond = (body: unknown) =>
    new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });

afterEach(() => {
    vi.restoreAllMocks();
});

describe('StatsPage', () => {
    it('sums up the library, ratings and readers, and scans a library', async () => {
        const requests: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                requests.push(`${init?.method ?? 'GET'} ${String(input)}`);
                const url = String(input);
                return url.endsWith('/scan')
                    ? respond({ added: 2, updated: 0, removed: 0, errors: [] })
                    : url.startsWith('/api/stats/reading')
                      ? respond(READING)
                      : respond(STATS);
            },
        );

        render(
            <MantineProvider>
                <MemoryRouter>
                    <StatsPage />
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(await screen.findByText('Statistiques')).toBeTruthy();
        // Total et ligne de la bibliothèque.
        expect(screen.getAllByText('2 Go')).toHaveLength(2);
        expect(screen.getByText('Séries en attente')).toBeTruthy();
        expect(screen.getByLabelText('10+ : 1 séries')).toBeTruthy();
        expect(
            screen.getByLabelText('Sans classification : 2 séries'),
        ).toBeTruthy();
        expect(screen.getByText(/masquées aux comptes limités/)).toBeTruthy();
        expect(await screen.findByText('Jusqu’à 10 ans')).toBeTruthy();
        // Lecture sur 30 jours par défaut, une fiche par personne.
        expect(screen.getByText('1,5 h', { selector: 'p' })).toBeTruthy();
        expect(screen.getByText('sur 2')).toBeTruthy();
        expect(
            screen.getByRole('link', { name: 'Alice' }).getAttribute('href'),
        ).toBe('/stats/readers/2?period=30d');
        // Son avatar à côté de son nom.
        expect(
            screen.getByRole('img', { name: 'Alice' }).getAttribute('src'),
        ).toContain('alice-seed');
        expect(
            requests.some((r) =>
                r.startsWith('GET /api/stats/reading?period=30d&tz='),
            ),
        ).toBe(true);
        // Un jour lu dans le calendrier, le soir dans les moments.
        expect(
            screen.getByLabelText(/dimanche 15 novembre 2026 : 1,5 h/),
        ).toBeTruthy();
        expect(screen.getByLabelText('dim. 20 h : 1,5 h')).toBeTruthy();

        // Autre période : relue.
        fireEvent.click(screen.getByText('7 jours'));
        await vi.waitFor(() =>
            expect(
                requests.some((r) =>
                    r.startsWith('GET /api/stats/reading?period=7d'),
                ),
            ).toBe(true),
        );

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Scanner' }));
        });

        expect(requests).toContain('POST /api/libraries/1/scan');
        expect(await screen.findByText(/2 ajouté\(s\)/)).toBeTruthy();
    });
});
