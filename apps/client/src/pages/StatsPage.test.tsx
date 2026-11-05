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
                return String(input).endsWith('/scan')
                    ? respond({ added: 2, updated: 0, removed: 0, errors: [] })
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
        expect(screen.getByLabelText('10 ans et + : 1 séries')).toBeTruthy();
        expect(
            screen.getByLabelText('Sans classification : 2 séries'),
        ).toBeTruthy();
        expect(screen.getByText(/masquées aux comptes limités/)).toBeTruthy();
        expect(screen.getByText('Jusqu’à 10 ans')).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Scanner' }));
        });

        expect(requests).toContain('POST /api/libraries/1/scan');
        expect(await screen.findByText(/2 ajouté\(s\)/)).toBeTruthy();
    });
});
