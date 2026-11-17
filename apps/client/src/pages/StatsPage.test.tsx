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

const LIBRARY = {
    growth: [{ month: '2026-11', volumes: 40, size: 2 * 1024 ** 3, series: 3 }],
    formats: [{ name: 'Manga', series: 3, volumes: 40, size: 2 * 1024 ** 3 }],
    genres: [{ name: 'Action', series: 2, seconds: 5400 }],
    publishers: [{ name: 'Tonkam', series: 2 }],
    authors: [{ name: 'Hiroya Oku', series: 2 }],
    dormant: [
        {
            id: 7,
            name: 'Spirale',
            volumes: 1,
            size: 1024 ** 3,
            addedAt: '2026-11-04T12:00:00.000Z',
        },
    ],
};

const RANKINGS = {
    topSeries: [
        {
            id: 3,
            name: 'Gantz',
            seconds: 5400,
            pages: 300,
            readers: [{ id: 2, name: 'Alice', avatarSeed: 'alice-seed' }],
        },
    ],
    perReader: [
        {
            id: 2,
            name: 'Alice',
            avatarSeed: 'alice-seed',
            seconds: 5400,
            series: [{ id: 3, name: 'Gantz', seconds: 5400 }],
        },
    ],
    bestRated: [
        {
            id: 3,
            name: 'Gantz',
            readers: 1,
            seconds: 5400,
            rating: 4.2,
            reviews: 300,
        },
        {
            id: 7,
            name: 'Spirale',
            readers: 0,
            seconds: 0,
            rating: 4.1,
            reviews: 40,
        },
    ],
    unreadGems: [
        {
            id: 7,
            name: 'Spirale',
            readers: 0,
            seconds: 0,
            rating: 4.1,
            reviews: 40,
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
                      : url.startsWith('/api/stats/library')
                        ? respond(LIBRARY)
                        : url.startsWith('/api/stats/rankings')
                          ? respond(RANKINGS)
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
        expect(screen.getByText('Séries en attente')).toBeTruthy();
        // Onglet Lecture par défaut.
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

        // Classements de la même période.
        fireEvent.click(screen.getByRole('tab', { name: 'Classements' }));
        expect(
            await screen.findByText('Bien notés, jamais ouverts'),
        ).toBeTruthy();
        expect(
            requests.some((r) =>
                r.startsWith('GET /api/stats/rankings?period=7d'),
            ),
        ).toBe(true);
        expect(
            screen.getByText('★ 4,2 (300 avis) · 1 lecteur, 1,5 h'),
        ).toBeTruthy();
        expect(
            screen.getAllByText('★ 4,1 (40 avis) · jamais ouverte'),
        ).toHaveLength(2);

        // Bibliothèque : sans période.
        fireEvent.click(screen.getByRole('tab', { name: 'Bibliothèque' }));
        expect(await screen.findByText('Jamais ouvertes (1)')).toBeTruthy();
        expect(screen.queryByText('7 jours')).toBeNull();
        expect(screen.getByLabelText('Tonkam : 2 séries')).toBeTruthy();
        expect(screen.getByLabelText('Hiroya Oku : 2 séries')).toBeTruthy();
        // Total, format et ligne de la bibliothèque.
        expect(screen.getAllByText('2 Go')).toHaveLength(3);
        expect(screen.getByLabelText('10+ : 1 séries')).toBeTruthy();
        expect(
            screen.getByLabelText('Sans classification : 2 séries'),
        ).toBeTruthy();
        expect(screen.getByText(/masquées aux comptes limités/)).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Scanner' }));
        });

        expect(requests).toContain('POST /api/libraries/1/scan');
        expect(await screen.findByText(/2 ajouté\(s\)/)).toBeTruthy();
    });
});
