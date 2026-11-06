import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type CurrentUser, UserContext } from '@/services/auth';

import { SeriesPage } from './SeriesPage';

const READER: CurrentUser = {
    id: 2,
    name: 'Alice',
    email: null,
    role: 'reader',
    maxAge: null,
    preview: null,
};

const volume = (id: number, completed: boolean | null) => ({
    id,
    number: String(id),
    title: null,
    pageCount: 10,
    size: 1,
    addedAt: '2026-01-01T00:00:00.000Z',
    progress: completed === null ? null : { page: 9, completed },
    admin: null,
});

const SERIES = {
    id: 3,
    name: 'Gantz',
    summary: null,
    formatId: 1,
    format: 'Manga',
    genres: ['Action', 'Sport'],
    themes: ['boxe'],
    ageRating: null,
    age: null,
    fileAge: null,
    year: null,
    status: 'completed',
    writer: null,
    publisher: null,
    coverUpdatedAt: null,
    toRead: false,
    collectionIds: [] as number[],
    library: { id: 1, name: 'Mangas', type: 'manga' },
    volumes: [volume(1, true), volume(2, null)],
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SeriesPage', () => {
    it('lets a reader mark the whole series read or unread', async () => {
        const requests: [string, string, unknown][] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                requests.push([
                    init?.method ?? 'GET',
                    String(input),
                    init?.body ? JSON.parse(String(init.body)) : undefined,
                ]);
                const body = String(input).endsWith('/read')
                    ? { volumes: 2, read: true }
                    : SERIES;
                return new Response(JSON.stringify(body), {
                    headers: { 'Content-Type': 'application/json' },
                });
            },
        );
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        render(
            <MantineProvider>
                <UserContext.Provider value={READER}>
                    <MemoryRouter initialEntries={['/series/3']}>
                        <Routes>
                            <Route
                                path="/series/:id"
                                element={<SeriesPage />}
                            />
                        </Routes>
                    </MemoryRouter>
                </UserContext.Provider>
            </MantineProvider>,
        );

        expect(await screen.findByText('Série terminée')).toBeTruthy();
        // Format, genres et thèmes.
        // Taille totale des tomes (1 octet chacun ici).
        expect(screen.getByText('Manga · 2 o')).toBeTruthy();
        // Complétude : seulement pour l'admin.
        expect(screen.queryByText(/Fiche à/)).toBeNull();
        expect(screen.getByText('Sport')).toBeTruthy();
        expect(screen.getByText('Thèmes : boxe')).toBeTruthy();
        fireEvent.click(
            screen.getByRole('button', { name: 'Lecture de la série' }),
        );
        await act(async () => {
            fireEvent.click(
                await screen.findByText('Marquer toute la série comme lue'),
            );
        });
        expect(requests).toContainEqual([
            'PUT',
            '/api/series/3/read',
            { read: true },
        ]);

        fireEvent.click(
            screen.getByRole('button', { name: 'Lecture de la série' }),
        );
        await act(async () => {
            fireEvent.click(
                await screen.findByText('Marquer toute la série comme non lue'),
            );
        });
        expect(window.confirm).toHaveBeenCalled();
        expect(requests).toContainEqual([
            'PUT',
            '/api/series/3/read',
            { read: false },
        ]);
    });

    it('adds the series to the to-read list', async () => {
        let toRead = false;
        const requests: [string, string, unknown][] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                const body = init?.body
                    ? JSON.parse(String(init.body))
                    : undefined;
                requests.push([init?.method ?? 'GET', String(input), body]);
                if (String(input).endsWith('/lists')) {
                    toRead = body.toRead;
                }
                return new Response(
                    JSON.stringify(
                        String(input).endsWith('/lists')
                            ? { toRead }
                            : { ...SERIES, toRead },
                    ),
                    { headers: { 'Content-Type': 'application/json' } },
                );
            },
        );

        render(
            <MantineProvider>
                <UserContext.Provider value={READER}>
                    <MemoryRouter initialEntries={['/series/3']}>
                        <Routes>
                            <Route
                                path="/series/:id"
                                element={<SeriesPage />}
                            />
                        </Routes>
                    </MemoryRouter>
                </UserContext.Provider>
            </MantineProvider>,
        );

        const button = await screen.findByRole('button', { name: 'À lire' });
        expect(button.getAttribute('aria-pressed')).toBe('false');
        await act(async () => {
            fireEvent.click(button);
        });

        expect(requests).toContainEqual([
            'PUT',
            '/api/series/3/lists',
            { toRead: true },
        ]);
        await vi.waitFor(() =>
            expect(
                screen
                    .getByRole('button', { name: 'À lire' })
                    .getAttribute('aria-pressed'),
            ).toBe('true'),
        );
        // Les collections sont réservées à l'admin.
        fireEvent.click(
            screen.getByRole('button', { name: 'Lecture de la série' }),
        );
        expect(await screen.findByText(/comme lue/)).toBeTruthy();
        expect(screen.queryByText('Collections…')).toBeNull();
    });
});
