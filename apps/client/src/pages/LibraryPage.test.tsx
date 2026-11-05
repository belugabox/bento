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
        expect(await screen.findByText('Akira')).toBeTruthy();
        expect(titles()).toEqual(['/series/1', '/series/2', '/series/3']);
        // Série entièrement lue : marquée ; commencée : « 1 / 3 lus ».
        expect(screen.getByLabelText('Série lue')).toBeTruthy();
        expect(screen.getByText('1 / 3 lus')).toBeTruthy();
        // Le scan n'est plus sur l'accueil.
        expect(screen.queryByRole('button', { name: /scanner/i })).toBeNull();
    });

    it('filters by reading state and sorts by recent additions, in the address', async () => {
        show();
        await screen.findByText('Akira');

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
});
