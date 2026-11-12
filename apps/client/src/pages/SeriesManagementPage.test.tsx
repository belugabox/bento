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
    // Calculée par le serveur.
    completeness: { percent: 90, missing: ['Note'] },
    volumesStatus: {
        published: null as number | null,
        missing: [] as number[],
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
            completeness: { percent: 81, missing: ['Format', 'Note'] },
        }),
        managed(3, 'Gantz', {
            size: 900 * MB,
            // Fiche changée en ligne depuis la dernière visite.
            sheetChanges: ['Tomes : 37 → 38'],
            sheetSites: ['manga-news', 'bedetheque'],
            volumesStatus: { published: 4, missing: [3, 4] },
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
        ).toBe('/series/2/edit?fill=online&from=to-classify');

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
        ).toBe('/series/3/edit?fill=online&from=to-classify');
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

    it('finds the series without a Bedetheque sheet', async () => {
        show();
        await screen.findByText('Gantz');
        fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
        fireEvent.click(await screen.findByRole('textbox', { name: 'Fiches' }));
        fireEvent.click(
            await screen.findByRole('option', {
                name: 'Sans fiche Bedetheque (2)',
            }),
        );
        await vi.waitFor(() =>
            expect(names()).toEqual(['Coq de combat', 'Spirale']),
        );
    });

    it('finds the series with missing volumes', async () => {
        show();
        await screen.findByText('Gantz');
        expect(
            screen.getByText('Tomes manquants : 3, 4 (4 parus)'),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
        fireEvent.click(await screen.findByRole('textbox', { name: 'Fiches' }));
        fireEvent.click(
            await screen.findByRole('option', { name: 'Tomes manquants (1)' }),
        );
        await vi.waitFor(() => expect(names()).toEqual(['Gantz']));
    });
});
