import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
    ...changes,
});

let series: ReturnType<typeof managed>[] = [];
let requests: [string, string, unknown][] = [];

beforeEach(() => {
    requests = [];
    series = [
        managed(1, 'Spirale', { age: null, size: 50 * MB }),
        managed(2, 'Coq de combat', { formatId: null, format: null }),
        managed(3, 'Gantz', { size: 900 * MB }),
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
    it('starts with the series to classify, then shows them all', async () => {
        show();

        expect(
            await screen.findByRole('button', { name: 'À classer (2)' }),
        ).toBeTruthy();
        expect(names()).toEqual(['Coq de combat', 'Spirale']);
        // « Remplir » ouvre l'éditeur, recherche en ligne lancée.
        expect(
            screen
                .getByRole('link', { name: 'Remplir Coq de combat' })
                .getAttribute('href'),
        ).toBe('/series/2/edit?fill=online&from=to-classify');

        fireEvent.click(screen.getByRole('button', { name: 'Toutes (3)' }));
        expect(names()).toEqual(['Coq de combat', 'Gantz', 'Spirale']);
        // Moyennes : par tome et par page.
        const gantz = cards()[1]!;
        expect(within(gantz).getByText(/450 Mo \/ tome/)).toBeTruthy();
        expect(within(gantz).getByText(/2,3 Mo \/ page/)).toBeTruthy();
    });

    it('sorts by size, the biggest first on a second click', async () => {
        show('/manage?filter=all');
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

    it('sets the format in the row, which stays on screen', async () => {
        show();
        const select = await screen.findByRole('textbox', {
            name: 'Format de Coq de combat',
        });
        fireEvent.click(select);
        // Ce que le serveur renverra au rechargement.
        series[1] = { ...series[1]!, formatId: 2, format: 'Webtoon' };
        await act(async () => {
            fireEvent.click(
                await screen.findByRole('option', { name: 'Webtoon' }),
            );
        });

        expect(requests).toContainEqual([
            'PUT',
            '/api/series/2/classification',
            { formatId: 2 },
        ]);
        // Classée : elle sort du filtre, mais reste affichée.
        await vi.waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'À classer (1)' }),
            ).toBeTruthy(),
        );
        expect(names()).toEqual(['Coq de combat', 'Spirale']);
    });
});
