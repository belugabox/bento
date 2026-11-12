import { MantineProvider } from '@mantine/core';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type CurrentUser, UserContext } from '@/services/auth';

import { SeriesPage } from './SeriesPage';

const READER: CurrentUser = {
    id: 2,
    name: 'Alice',
    username: 'alice',
    email: null,
    avatarSeed: null,
    hasPassword: true,
    role: 'reader',
    maxAge: null,
    preview: null,
};

const volume = (
    id: number,
    completed: boolean | null,
    kind: 'volume' | 'hors-serie' = 'volume',
) => ({
    id,
    number: String(id),
    kind,
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
    sources: [],
    volumesStatus: { published: null, missing: [] as number[] },
    library: { id: 1, name: 'Mangas', type: 'manga' },
    volumes: [volume(1, true), volume(2, null), volume(7, null, 'hors-serie')],
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
        // Pas la taille des fichiers.
        expect(screen.getByText('Manga')).toBeTruthy();
        expect(screen.queryByText(/ o$/)).toBeNull();
        // Complétude : seulement pour l'admin.
        expect(screen.queryByText(/Fiche à/)).toBeNull();
        expect(screen.getByText('Sport')).toBeTruthy();
        expect(screen.getByText('Thèmes : boxe')).toBeTruthy();
        // Hors-séries à part, sous les tomes.
        expect(
            screen.getByRole('heading', { name: 'Hors-séries' }),
        ).toBeTruthy();
        expect(screen.getByText('Hors-série 7')).toBeTruthy();
        expect(screen.getByText('2 tomes · 1 hors-série')).toBeTruthy();
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
    });

    it('shows a one-shot without its volume', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async () =>
                new Response(
                    JSON.stringify({
                        ...SERIES,
                        volumes: [
                            {
                                ...volume(1, null),
                                number: null,
                                kind: 'one-shot',
                            },
                        ],
                    }),
                    { headers: { 'Content-Type': 'application/json' } },
                ),
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

        expect(await screen.findByText('One-shot')).toBeTruthy();
        // « Lire », sans « tome 1 » ; pas de carte de tome.
        expect(screen.getByRole('link', { name: 'Lire' })).toBeTruthy();
        expect(
            screen.queryByRole('button', { name: /^Actions pour/ }),
        ).toBeNull();
    });

    it('links its online sheets at the end of the summary', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async () =>
                new Response(
                    JSON.stringify({
                        ...SERIES,
                        summary: 'Des aliens.',
                        sources: [
                            { site: 'wikipedia', id: '7' },
                            { site: 'bedetheque', id: '500' },
                        ],
                    }),
                    { headers: { 'Content-Type': 'application/json' } },
                ),
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

        const link = await screen.findByRole('link', { name: 'Bedetheque' });
        expect(link.getAttribute('href')).toBe(
            'https://www.bedetheque.com/serie_500.html',
        );
        expect(link.getAttribute('target')).toBe('_blank');
        expect(
            screen
                .getByRole('link', { name: 'Wikipédia' })
                .getAttribute('href'),
        ).toBe('https://fr.wikipedia.org/?curid=7');
    });

    it('shows the missing volumes, from the numbering and the sheets', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async () =>
                new Response(
                    JSON.stringify({
                        ...SERIES,
                        volumesStatus: { published: 6, missing: [3, 4, 5, 6] },
                    }),
                    { headers: { 'Content-Type': 'application/json' } },
                ),
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

        expect(
            await screen.findByText('Tomes manquants : 3 à 6 (6 parus)'),
        ).toBeTruthy();
    });

    it('offers the downloads in their own small menu', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async () =>
                new Response(JSON.stringify(SERIES), {
                    headers: { 'Content-Type': 'application/json' },
                }),
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

        fireEvent.click(
            await screen.findByRole('button', { name: 'Télécharger' }),
        );
        expect(
            (await screen.findAllByRole('menuitem')).map((i) => i.textContent),
        ).toEqual([
            'Le prochain tome',
            'Les 2 prochains tomes',
            'Les 3 prochains tomes',
            'Les 5 prochains tomes',
            'Tous les tomes pas lus',
        ]);
        // Plus dans le menu de lecture.
        fireEvent.click(screen.getByRole('button', { name: 'Télécharger' }));
        await waitFor(() =>
            expect(screen.queryByText('Le prochain tome')).toBeNull(),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Lecture de la série' }),
        );
        await screen.findByText('Marquer toute la série comme lue');
        expect(screen.queryByText('Le prochain tome')).toBeNull();
    });

    it('offers a menu on each volume', async () => {
        const requests: [string, string, unknown][] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                requests.push([
                    init?.method ?? 'GET',
                    String(input),
                    init?.body ? JSON.parse(String(init.body)) : undefined,
                ]);
                const body = String(input).endsWith('/read')
                    ? { volumes: 2, read: true, previous: [] }
                    : SERIES;
                return new Response(JSON.stringify(body), {
                    headers: { 'Content-Type': 'application/json' },
                });
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

        // Tome 1, déjà lu : « Relire », pas de « jusqu'à » (premier tome).
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Actions pour Tome 1',
            }),
        );
        expect(await screen.findByText('Relire')).toBeTruthy();
        expect(screen.getByText('Marquer comme non lu')).toBeTruthy();
        expect(
            screen.queryByText('Marquer comme lu jusqu’à ce tome'),
        ).toBeNull();
        // Lecteur : pas de couverture à changer.
        expect(
            screen.queryByText('Utiliser comme couverture de la série'),
        ).toBeNull();
        fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

        // Tome 2 : lu jusqu'à lui.
        fireEvent.click(
            screen.getByRole('button', { name: 'Actions pour Tome 2' }),
        );
        await act(async () => {
            fireEvent.click(
                await screen.findByText('Marquer comme lu jusqu’à ce tome'),
            );
        });
        expect(requests).toContainEqual([
            'PUT',
            '/api/series/3/read',
            { read: true, upTo: 2 },
        ]);
    });
});
