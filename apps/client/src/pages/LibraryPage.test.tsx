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
    favorite: index === 1,
    toRead: false,
    collectionIds: index === 0 ? [7] : [],
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
                },
            ]);
        }
        if (url === '/api/home') {
            return respond({
                next: [
                    {
                        volumeId: 51,
                        seriesId: 1,
                        seriesName: 'Akira',
                        number: '4',
                        title: null,
                    },
                ],
                recent: [
                    {
                        volumeId: 60,
                        seriesId: 2,
                        seriesName: 'Berserk',
                        number: '41',
                        title: null,
                        addedAt: '2026-03-01T00:00:00.000Z',
                    },
                ],
            });
        }
        if (url === '/api/collections') {
            return respond([{ id: 7, name: 'Classiques', seriesCount: 1 }]);
        }
        if (url.startsWith('/api/series')) return respond(SERIES);
        throw new Error(`requête inattendue : ${url}`);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

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
        expect(screen.getByText('Tome 2')).toBeTruthy();
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

        fireEvent.click(screen.getByText('Commencées'));
        expect(titles()).toEqual(['/series/3']);
        expect(location).toBe('?filter=started');

        fireEvent.click(screen.getByText('Toutes'));
        fireEvent.click(
            screen.getByRole('textbox', { name: 'Trier les séries' }),
        );
        fireEvent.click(await screen.findByText('Ajouts récents'));
        expect(titles()).toEqual(['/series/2', '/series/3', '/series/1']);
        expect(location).toBe('?sort=recent');
    });

    it('suggests what comes next and the newest volumes', async () => {
        show();

        expect(await screen.findByText('La suite de tes séries')).toBeTruthy();
        expect(screen.getByText('Nouveautés')).toBeTruthy();
        expect(screen.getByText('Tome 41')).toBeTruthy();
        expect(
            screen
                .getAllByRole('link')
                .some((link) => link.getAttribute('href') === '/read/51'),
        ).toBe(true);
    });

    it('keeps the favorites or a collection, in the address', async () => {
        show();
        await screen.findByTestId('series-grid');
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        fireEvent.click(screen.getByRole('textbox', { name: 'Liste' }));
        fireEvent.click(await screen.findByText('Mes favoris'));
        expect(titles()).toEqual(['/series/2']);
        expect(location).toBe('?list=favorite');

        fireEvent.click(screen.getByRole('textbox', { name: 'Liste' }));
        fireEvent.click(await screen.findByText('Classiques'));
        expect(titles()).toEqual(['/series/1']);
        expect(location).toBe('?list=collection%3A7');
    });
});
