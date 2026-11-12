import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveManageQueue } from '@/components/manageQueue';

import { SeriesEditPage } from './SeriesEditPage';

const SERIES = {
    id: 1,
    name: 'Spirale',
    summary: null,
    status: null,
    formatId: 1,
    format: 'Manga',
    age: 16,
    fileAge: null,
    genres: [],
    themes: [],
    sources: [],
    rating: null,
    readingMode: null,
    defaultReadingMode: 'ltr-manga',
    coverUpdatedAt: null,
    bannerUpdatedAt: null,
    library: { id: 1, name: 'Mangas', type: 'manga' },
    volumes: [
        {
            id: 10,
            number: '1',
            kind: 'volume',
            title: null,
            pageCount: 20,
            version: 1,
            size: 1000,
            addedAt: '2026-01-01T00:00:00.000Z',
            progress: null,
            admin: {
                file: 'Spirale/Spirale #01.cbz',
                comicInfo: { Series: 'Spirale', Number: '1' },
            },
        },
    ],
};

let location = '';
const Location = () => {
    location = useLocation().pathname + useLocation().search;
    return null;
};

beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        const body = url.startsWith('/api/series/')
            ? SERIES
            : url.startsWith('/api/settings')
              ? { settings: { disabledSources: [], ages: [0, 12, 16] } }
              : url.includes('/credits')
                ? { writers: [], pencillers: [], publishers: [] }
                : [];
        return new Response(JSON.stringify(body), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
});

const show = (path: string) =>
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route
                        path="/series/:id/edit"
                        element={<SeriesEditPage />}
                    />
                </Routes>
                <Location />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('SeriesEditPage', () => {
    it('follows the list of the Series page: back link, place, next series', async () => {
        saveManageQueue({
            items: [
                { id: 2, name: 'Coq de combat' },
                { id: 1, name: 'Spirale' },
                { id: 3, name: 'Gantz' },
            ],
            search: 'sheet=bedetheque',
        });
        show('/series/1/edit?from=manage');

        const back = await screen.findByRole('link', { name: /Séries/ });
        expect(back.getAttribute('href')).toBe('/manage?sheet=bedetheque');
        expect(back.textContent).toContain('(2 / 3)');
        // Plus de « Séries à classer : 0 ».
        expect(screen.queryByText(/Séries à classer/)).toBeNull();

        fireEvent.click(
            await screen.findByRole('button', { name: /Suivante/ }),
        );
        await vi.waitFor(() =>
            expect(location).toBe('/series/3/edit?from=manage'),
        );
    });

    it('has neither when opened from elsewhere', async () => {
        show('/series/1/edit');
        await screen.findByText('Modifier la série');
        expect(screen.queryByRole('button', { name: /Suivante/ })).toBeNull();
        expect(screen.queryByRole('link', { name: /^Séries/ })).toBeNull();
    });
});
