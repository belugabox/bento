import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
    library: { id: 1, name: 'Mangas', type: 'manga' },
    volumes: [volume(1, true), volume(2, null), volume(7, null, 'hors-serie')],
};

/** Réponse de la liste des séries (suggestions de la fiche). */
let seriesList: unknown[] = [];
const listResponse = () =>
    new Response(JSON.stringify(seriesList), {
        headers: { 'Content-Type': 'application/json' },
    });

afterEach(() => {
    vi.restoreAllMocks();
    seriesList = [];
});

describe('SeriesPage', () => {
    it('lets a reader mark the whole series read or unread', async () => {
        const requests: [string, string, unknown][] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                // Liste des séries (suggestions) : vide ici.
                if (String(input) === '/api/series') return listResponse();
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
        fireEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
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

        fireEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
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
                // Liste des séries (suggestions) : vide ici.
                if (String(input) === '/api/series') return listResponse();
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
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
            // Liste des séries (suggestions) : vide ici.
            String(input) === '/api/series'
                ? listResponse()
                : new Response(
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
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
            // Liste des séries (suggestions) : vide ici.
            String(input) === '/api/series'
                ? listResponse()
                : new Response(
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

    it('shows the volumes of each group in their own block, hors-séries too', async () => {
        const grouped = (
            id: number,
            group: string,
            number: string,
            kind: 'volume' | 'hors-serie' = 'volume',
        ) => ({ ...volume(id, null, kind), number, group });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
            // Liste des séries (suggestions) : vide ici.
            String(input) === '/api/series'
                ? listResponse()
                : new Response(
                      JSON.stringify({
                          ...SERIES,
                          volumes: [
                              grouped(1, 'Part 1 - Rouge, Bleu et Jaune', '1'),
                              grouped(2, 'Part 1 - Rouge, Bleu et Jaune', '2'),
                              grouped(3, 'Part 2 - Or et Argent', '1'),
                              grouped(4, 'Guides', '1', 'hors-serie'),
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

        expect(
            await screen.findByRole('heading', {
                name: 'Part 1 - Rouge, Bleu et Jaune',
            }),
        ).toBeTruthy();
        expect(
            screen.getByRole('heading', { name: 'Part 2 - Or et Argent' }),
        ).toBeTruthy();
        expect(
            screen.getByRole('heading', { name: 'Hors-séries — Guides' }),
        ).toBeTruthy();
        // Dans son bloc, le tome garde son numéro dans le groupe.
        expect(screen.getAllByText('Tome 1')).toHaveLength(2);
    });

    it('offers the downloads in their own small menu', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
            // Liste des séries (suggestions) : vide ici.
            String(input) === '/api/series'
                ? listResponse()
                : new Response(JSON.stringify(SERIES), {
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

        // Dans le menu « ⋯ », après la lecture (pas de bouton à part).
        expect(
            screen.queryByRole('button', { name: 'Télécharger' }),
        ).toBeNull();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Plus d’actions' }),
        );
        expect(
            (await screen.findAllByRole('menuitem')).map((i) => i.textContent),
        ).toEqual([
            'Marquer toute la série comme lue',
            'Marquer toute la série comme non lue',
            'Le prochain tome',
            'Les 2 prochains tomes',
            'Les 3 prochains tomes',
            'Les 5 prochains tomes',
            'Tous les tomes pas lus',
        ]);
        expect(screen.getByText('Télécharger sur l’appareil')).toBeTruthy();
    });

    it('offers a menu on each volume', async () => {
        const requests: [string, string, unknown][] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                // Liste des séries (suggestions) : vide ici.
                if (String(input) === '/api/series') return listResponse();
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

    it('suggests the series of the same author, then of the same genre', async () => {
        const listed = (id: number, name: string, extra: object) => ({
            id,
            name,
            libraryId: 1,
            volumeCount: 2,
            readCount: 0,
            startedCount: 0,
            lastAddedAt: null,
            coverUpdatedAt: null,
            coverVolumeId: id * 10,
            genres: [],
            themes: [],
            format: 'Manga',
            writer: null,
            penciller: null,
            ...extra,
        });
        seriesList = [
            listed(3, 'Gantz', {
                genres: ['Action', 'Sport'],
                themes: ['boxe'],
                writer: 'Hiroya Oku',
            }),
            listed(4, 'Inuyashiki', { writer: 'Hiroya Oku' }),
            listed(5, 'Hajime no Ippo', {
                genres: ['Sport'],
                themes: ['boxe'],
            }),
            listed(6, 'Blacksad', { genres: ['Polar'] }),
        ];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
            String(input) === '/api/series'
                ? listResponse()
                : new Response(JSON.stringify(SERIES), {
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

        const author = await screen.findByRole('region', {
            name: 'Du même auteur',
        });
        expect(within(author).getByText('Inuyashiki')).toBeTruthy();
        expect(within(author).getByText('Hiroya Oku')).toBeTruthy();
        expect(
            within(author)
                .getByRole('link', { name: 'Tout voir : Du même auteur' })
                .getAttribute('href'),
        ).toBe('/library?q=Hiroya+Oku');
        const genre = screen.getByRole('region', {
            name: 'Dans le même genre',
        });
        expect(within(genre).getByText('Hajime no Ippo')).toBeTruthy();
        expect(within(genre).getByText('boxe · Sport')).toBeTruthy();
        expect(within(genre).queryByText('Blacksad')).toBeNull();
    });
});
