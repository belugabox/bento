import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SeriesManagementPage } from './SeriesManagementPage';

const MB = 1024 * 1024;

const managed = (
    id: number,
    name: string,
    changes: Partial<Record<string, unknown>> = {},
) => ({
    id,
    libraryId: 1,
    libraryName: 'Mangas',
    libraryType: 'manga',
    name,
    formatId: 1,
    format: 'Manga',
    age: 12,
    fileAge: null,
    status: 'completed',
    hasSummary: true,
    writer: 'X',
    publisher: 'Y',
    penciller: 'Z',
    volumeCount: 2,
    withNumber: 2,
    withYear: 2,
    pageCount: 400,
    size: 200 * MB,
    firstAddedAt: '2026-01-01T00:00:00.000Z',
    lastAddedAt: '2026-02-01T00:00:00.000Z',
    coverUpdatedAt: null,
    coverVolumeId: id * 10,
    coverVolumeVersion: 1,
    genres: ['Action'],
    themes: [],
    rating: null,
    ratingCount: 0,
    sheetChanges: [] as string[],
    sheetSites: [] as string[],
    proposals: [] as unknown[],
    // Calculée par le serveur.
    completeness: { percent: 90, missing: ['Note'] },
    volumesStatus: {
        published: null as { site: string; count: number } | null,
        others: [] as unknown[],
        missing: [] as number[],
        chosen: null as string | null,
    },
    ...changes,
});

let series: ReturnType<typeof managed>[] = [];
let requests: [string, string, unknown][] = [];

beforeEach(() => {
    requests = [];
    series = [
        managed(1, 'Spirale', {
            age: null,
            size: 50 * MB,
            completeness: { percent: 81, missing: ['Âge', 'Note'] },
        }),
        managed(2, 'Coq de combat', {
            formatId: null,
            format: null,
            // Trouvée la nuit, à lier.
            proposals: [
                {
                    site: 'bedetheque',
                    id: '7000',
                    title: 'Coq de combat',
                    details: {
                        writer: 'Izō Hashimoto',
                        penciller: 'Akio Tanaka',
                        publisher: 'Delcourt',
                        volumeCount: 34,
                        year: 2004,
                        sameAuthor: true,
                    },
                },
            ],
            completeness: { percent: 81, missing: ['Format', 'Note'] },
        }),
        managed(3, 'Gantz', {
            size: 900 * MB,
            // Fiche changée en ligne depuis la dernière visite.
            sheetChanges: ['Tomes : 37 → 38'],
            sheetSites: ['manga-news', 'bedetheque'],
            volumesStatus: {
                published: { site: 'bedetheque', count: 4 },
                others: [],
                missing: [3, 4],
                chosen: null,
            },
        }),
    ];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        requests.push([
            method,
            url,
            typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        ]);
        const body =
            url === '/api/manage/series'
                ? series
                : url === '/api/formats'
                  ? [
                        { id: 1, name: 'Manga', readingMode: 'ltr-manga' },
                        { id: 2, name: 'Webtoon', readingMode: 'webtoon' },
                    ]
                  : url.startsWith('/api/settings')
                    ? { settings: { ages: [0, 10, 12, 16] } }
                    : {};
        return new Response(JSON.stringify(body), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

const show = (path = '/manage') =>
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={[path]}>
                <SeriesManagementPage />
            </MemoryRouter>
        </MantineProvider>,
    );

/** Noms des séries, dans l'ordre des cartes. */
const cards = () => screen.getAllByTestId('managed-card');
const names = () =>
    cards().map((card) => within(card).getAllByRole('link')[0]!.textContent);

describe('SeriesManagementPage', () => {
    it('shows all the series, the least complete sheets first', async () => {
        show();

        await screen.findByText('Gantz');
        expect(names()).toEqual(['Coq de combat', 'Spirale', 'Gantz']);
        // Ce qui manque, dans la bulle du pourcentage.
        expect(within(cards()[0]!).getByText(/Format, Note/)).toBeTruthy();
        // « Remplir » ouvre l'éditeur, recherche en ligne lancée.
        expect(
            screen
                .getByRole('link', { name: 'Remplir Coq de combat' })
                .getAttribute('href'),
        ).toBe('/series/2/edit?fill=online&from=manage');

        // Moyennes : par tome et par page.
        const gantz = cards()[2]!;
        expect(within(gantz).getByText(/450 Mo \/ tome/)).toBeTruthy();
        expect(within(gantz).getByText(/2,3 Mo \/ page/)).toBeTruthy();
    });

    it('lists the sheets changed online, to review', async () => {
        show();
        fireEvent.click(
            await screen.findByRole('button', { name: '1 fiche à revoir' }),
        );
        await vi.waitFor(() => expect(names()).toEqual(['Gantz']));
        expect(
            screen.getByText('Fiche à revoir : Tomes : 37 → 38'),
        ).toBeTruthy();
        // « Revoir » relit ses fiches dans l'éditeur.
        expect(
            screen
                .getByRole('link', { name: 'Revoir Gantz' })
                .getAttribute('href'),
        ).toBe('/series/3/edit?fill=online&from=manage');
    });

    it('sorts by size, the biggest first on a second click', async () => {
        show();
        await screen.findByText('Gantz');

        fireEvent.click(screen.getByRole('textbox', { name: 'Trier par' }));
        fireEvent.click(await screen.findByRole('option', { name: 'Taille' }));
        await vi.waitFor(() =>
            expect(names()).toEqual(['Spirale', 'Coq de combat', 'Gantz']),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Ordre croissant' }),
        );
        await vi.waitFor(() =>
            expect(names()).toEqual(['Gantz', 'Coq de combat', 'Spirale']),
        );
    });

    it('filters the series to classify, from the filters button', async () => {
        show();
        await screen.findByText('Gantz');
        fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
        fireEvent.click(await screen.findByRole('textbox', { name: 'Fiches' }));
        fireEvent.click(
            await screen.findByRole('option', { name: 'À classer (2)' }),
        );
        await vi.waitFor(() =>
            expect(names()).toEqual(['Coq de combat', 'Spirale']),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Voir toutes' }));
        await vi.waitFor(() => expect(names()).toHaveLength(3));
    });

    it('finds the series without a sheet, or without the sheet of a site', async () => {
        series[0] = { ...series[0]!, sheetSites: ['wikipedia'] };
        show();
        await screen.findByText('Gantz');
        // Les fiches de chaque série, sur sa carte.
        expect(
            within(cards()[2]!).getByText('Fiches : Manga-news · Bedetheque'),
        ).toBeTruthy();
        expect(
            within(cards()[0]!).getByText('Aucune fiche en ligne'),
        ).toBeTruthy();

        const choose = async (option: string) => {
            fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
            fireEvent.click(
                await screen.findByRole('textbox', { name: 'Fiches en ligne' }),
            );
            fireEvent.click(
                await screen.findByRole('option', { name: option }),
            );
        };
        await choose('Aucune fiche (1)');
        await vi.waitFor(() => expect(names()).toEqual(['Coq de combat']));
        await choose('Sans Bedetheque (2)');
        await vi.waitFor(() =>
            expect(names()).toEqual(['Coq de combat', 'Spirale']),
        );
        await choose('Sans Manga-news (mangas) (2)');
        await vi.waitFor(() =>
            expect(names()).toEqual(['Coq de combat', 'Spirale']),
        );
    });

    it('finds the series with missing volumes', async () => {
        show();
        await screen.findByText('Gantz');
        expect(
            screen.getByText(
                'Tomes manquants : 3, 4 (4 parus d’après Bedetheque)',
            ),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
        fireEvent.click(await screen.findByRole('textbox', { name: 'Fiches' }));
        fireEvent.click(
            await screen.findByRole('option', { name: 'Tomes manquants (1)' }),
        );
        await vi.waitFor(() => expect(names()).toEqual(['Gantz']));
    });

    it('shows the sheets found at night, to link or refuse', async () => {
        show();
        const proposal = await screen.findByTestId('proposal');
        expect(
            within(proposal).getByText(
                'Izō Hashimoto · Akio Tanaka · Delcourt · 34 tomes · depuis 2004 · même auteur',
            ),
        ).toBeTruthy();
        expect(
            within(proposal)
                .getByRole('link', { name: 'Coq de combat' })
                .getAttribute('href'),
        ).toBe('https://www.bedetheque.com/serie_7000.html');

        fireEvent.click(within(proposal).getByRole('button', { name: 'Lier' }));
        await vi.waitFor(() =>
            expect(requests).toContainEqual([
                'POST',
                '/api/manage/series/2/proposals',
                { site: 'bedetheque', id: '7000', accept: true },
            ]),
        );
        // Liste rechargée.
        await vi.waitFor(() =>
            expect(
                requests.filter(([, url]) => url === '/api/manage/series'),
            ).toHaveLength(2),
        );
    });

    it('lets the admin choose the sheet that gives the number of volumes', async () => {
        // Spirale : Manga-news et Bedetheque ne disent pas le même nombre.
        series[0] = {
            ...series[0]!,
            volumesStatus: {
                published: { site: 'bedetheque', count: 2 },
                others: [{ site: 'manga-news', count: 3 }],
                missing: [],
                chosen: null,
            },
        };
        show();
        const spirale = (await screen.findAllByTestId('managed-card')).find(
            (card) => within(card).queryByText('Spirale'),
        )!;
        expect(
            within(spirale).getByText(
                '2 tomes parus d’après Bedetheque ; Manga-news : 3',
            ),
        ).toBeTruthy();

        fireEvent.click(
            within(spirale).getByRole('button', {
                name: 'Fiche qui donne le nombre de tomes',
            }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Manga-news : 3' }),
        );
        await vi.waitFor(() =>
            expect(requests).toContainEqual([
                'PUT',
                '/api/manage/series/1/volume-count-site',
                { site: 'manga-news' },
            ]),
        );
    });

    it('gives its list to the editor when a series is opened', async () => {
        show('/manage?sheet=bedetheque');
        await vi.waitFor(() =>
            expect(names()).toEqual(['Coq de combat', 'Spirale']),
        );
        fireEvent.click(screen.getByRole('link', { name: 'Modifier Spirale' }));
        expect(JSON.parse(sessionStorage.getItem('bento:manage')!)).toEqual({
            items: [
                { id: 2, name: 'Coq de combat' },
                { id: 1, name: 'Spirale' },
            ],
            search: 'sheet=bedetheque',
        });
    });
});
