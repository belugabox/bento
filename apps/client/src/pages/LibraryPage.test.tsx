import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryPage } from './LibraryPage';

const SERIES = [
    { name: 'Akira', readCount: 0, lastAddedAt: '2026-01-01T00:00:00.000Z' },
    { name: 'Berserk', readCount: 3, lastAddedAt: '2026-03-01T00:00:00.000Z' },
    {
        name: 'Coq de combat',
        readCount: 1,
        lastAddedAt: '2026-02-01T00:00:00.000Z',
    },
].map((s, index) => ({
    id: index + 1,
    libraryId: 1,
    year: null,
    genre: null,
    status: null,
    volumeCount: 3,
    startedCount: s.readCount,
    coverUpdatedAt: null,
    coverVolumeId: index + 10,
    toRead: index === 1,
    genres: [
        ['Action', 'Aventure', 'Comédie', 'Drame', 'Fantasy', 'Horreur'],
        ['Action', 'Horreur'],
        ['Sport'],
    ][index],
    ...s,
}));

const respond = (body: unknown) =>
    new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });

let location = '';
const Location = () => {
    location = useLocation().search;
    return null;
};

const titles = () =>
    within(screen.getByTestId('series-grid'))
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'));

beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url === '/api/libraries') {
            return respond([{ id: 1, name: 'Mangas', type: 'manga' }]);
        }
        if (url === '/api/continue') {
            return respond([
                {
                    volumeId: 42,
                    seriesId: 3,
                    seriesName: 'Coq de combat',
                    number: '2',
                    title: null,
                    page: 9,
                    pageCount: 20,
                    updatedAt: '2026-03-02T00:00:00.000Z',
                    readCount: 1,
                    volumeCount: 3,
                },
                // Suite d'une série entamée : tome pas encore ouvert.
                {
                    volumeId: 51,
                    seriesId: 1,
                    seriesName: 'Akira',
                    number: '4',
                    title: null,
                    page: null,
                    pageCount: 20,
                    updatedAt: '2026-03-01T00:00:00.000Z',
                    readCount: 3,
                    volumeCount: 6,
                },
            ]);
        }
        if (url.startsWith('/api/series')) return respond(SERIES);
        throw new Error(`requête inattendue : ${url}`);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** Choisit un état de lecture dans son menu. */
const readingFilter = async (label: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'État de lecture' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: label }));
};

const show = () =>
    render(
        <MantineProvider>
            <MemoryRouter>
                <LibraryPage />
                <Location />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('LibraryPage', () => {
    it('shows what to resume, then every series', async () => {
        show();

        expect(await screen.findByText('Reprendre la lecture')).toBeTruthy();
        // Le tome en cours, et l'avancement dans la série.
        expect(screen.getByText('T2 · 1/3 lus')).toBeTruthy();
        // Un tome lu sur trois, plus la moitié du deuxième.
        expect(
            screen
                .getAllByLabelText('Avancement')[0]!
                .getAttribute('aria-valuenow'),
        ).toBe('50');
        await vi.waitFor(() =>
            expect(titles()).toEqual(['/series/1', '/series/2', '/series/3']),
        );
        // Série entièrement lue : marquée ; commencée : « 1 / 3 lus ».
        expect(screen.getByLabelText('Série lue')).toBeTruthy();
        expect(screen.getByText('1 / 3 lus')).toBeTruthy();
        // Le scan n'est plus sur l'accueil.
        expect(screen.queryByRole('button', { name: /scanner/i })).toBeNull();
    });

    it('filters by reading state and sorts by recent additions, in the address', async () => {
        show();
        await screen.findByTestId('series-grid');
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        await readingFilter('En cours');
        await vi.waitFor(() => expect(titles()).toEqual(['/series/3']));
        expect(location).toBe('?filter=started');

        await readingFilter('Toutes');
        fireEvent.click(
            screen.getByRole('button', { name: 'Trier les séries' }),
        );
        fireEvent.click(await screen.findByText('Ajouts récents'));
        expect(titles()).toEqual(['/series/2', '/series/3', '/series/1']);
        expect(location).toBe('?sort=recent');
    });

    it('resumes with the next volume of a series, in the same row', async () => {
        show();

        expect(await screen.findByText('T4 · 3/6 lus')).toBeTruthy();
        expect(screen.queryByText('La suite de tes séries')).toBeNull();
        expect(
            screen
                .getAllByLabelText('Avancement')[1]!
                .getAttribute('aria-valuenow'),
        ).toBe('50');
        expect(
            screen
                .getAllByRole('link')
                .some((link) => link.getAttribute('href') === '/read/51'),
        ).toBe(true);
    });

    it('keeps the to-read list in the address', async () => {
        show();
        await screen.findByTestId('series-grid');
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        await readingFilter('À lire');
        await vi.waitFor(() => expect(titles()).toEqual(['/series/2']));
        expect(location).toBe('?filter=toread');
        await readingFilter('Toutes');
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
        expect(location).toBe('');
    });

    it('filters by genre with chips, the most frequent first', async () => {
        show();
        await screen.findByTestId('series-grid');
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        // Cinq pastilles, les genres aux plus de séries d'abord ; les autres
        // dans « Plus », avec leur nombre de séries.
        const genres = within(screen.getByLabelText('Genres'))
            .getAllByRole('button')
            .map((button) => button.textContent);
        expect(genres).toEqual([
            'Action',
            'Horreur',
            'Aventure',
            'Comédie',
            'Drame',
            'Plus',
        ]);

        fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
        const more = await screen.findAllByRole('menuitem');
        expect(more.map((item) => item.textContent)).toEqual([
            'Fantasy1',
            'Sport1',
        ]);
        fireEvent.click(more[1]!);
        await vi.waitFor(() => expect(titles()).toEqual(['/series/3']));
        expect(location).toBe('?genre=Sport');
        // Genre choisi dans « Plus » : montré en pastille, qui le retire.
        fireEvent.click(screen.getByRole('button', { name: 'Sport' }));
        await vi.waitFor(() => expect(location).toBe(''));
    });

    it('removes a genre chip with a second click', async () => {
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
        fireEvent.click(screen.getByRole('button', { name: 'Horreur' }));
        await vi.waitFor(() =>
            expect(titles()).toEqual(['/series/1', '/series/2']),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Horreur' }));
        await vi.waitFor(() => expect(location).toBe(''));
    });

    it('keeps the release status in the sort menu', async () => {
        show();
        await screen.findByTestId('series-grid');
        fireEvent.click(
            screen.getByRole('button', { name: 'Trier les séries' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Terminées' }),
        );
        await vi.waitFor(() => expect(location).toBe('?status=completed'));
        expect(
            await screen.findByText('Aucune série dans ce filtre.'),
        ).toBeTruthy();
        fireEvent.click(
            screen.getByRole('button', { name: 'Effacer les filtres' }),
        );
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
    });
});
