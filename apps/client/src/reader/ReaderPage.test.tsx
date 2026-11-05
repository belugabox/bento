import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReaderPage } from './ReaderPage';

type Saved = { page?: number; completed?: boolean };

const volume = (direction: 'rtl' | 'ltr', progress: Saved | null = null) => ({
    id: 7,
    seriesId: 3,
    seriesName: 'Spy x Family',
    number: '1',
    title: null,
    pageCount: 3,
    libraryType: direction === 'rtl' ? 'manga' : 'comics',
    direction,
    previousId: null,
    nextId: 8,
    progress,
});

// Progressions envoyées au serveur (PUT /api/volumes/7/progress).
let saved: Saved[] = [];

let location = '';
const Location = () => {
    location = useLocation().pathname + useLocation().search;
    return null;
};

const open = async (
    direction: 'rtl' | 'ltr',
    url = '/read/7',
    progress: Saved | null = null,
) => {
    saved = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const body =
            init?.method === 'PUT'
                ? (saved.push(JSON.parse(String(init.body))),
                  { progress: null })
                : volume(direction, progress);
        expect(String(input)).toMatch(/^\/api\/volumes\/7/);
        return new Response(JSON.stringify(body), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={[url]}>
                <Routes>
                    <Route path="/read/:id" element={<ReaderPage />} />
                    <Route path="*" element={null} />
                </Routes>
                <Location />
            </MemoryRouter>
        </MantineProvider>,
    );
    await screen.findByAltText(/^Page /);
};

const shownPage = () => screen.getByAltText(/^Page /).getAttribute('src');
const press = (key: string) =>
    act(() => {
        fireEvent.keyDown(window, { key });
    });

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ReaderPage', () => {
    it('turns pages with the left arrow when reading a manga', async () => {
        await open('rtl');
        expect(shownPage()).toBe('/api/volumes/7/pages/0');

        press('ArrowLeft');
        expect(shownPage()).toBe('/api/volumes/7/pages/1');
        expect(location).toBe('/read/7?page=2');

        press('ArrowRight');
        expect(shownPage()).toBe('/api/volumes/7/pages/0');
    });

    it('turns pages with the right arrow when reading a comic', async () => {
        await open('ltr');

        press('ArrowRight');

        expect(shownPage()).toBe('/api/volumes/7/pages/1');
    });

    it('resumes at the page in the address', async () => {
        await open('rtl', '/read/7?page=3');

        expect(shownPage()).toBe('/api/volumes/7/pages/2');
    });

    it('offers the next volume after the last page', async () => {
        await open('rtl', '/read/7?page=3');

        press(' ');

        expect(screen.getByText('Fin du tome')).toBeTruthy();
        expect(
            screen
                .getByRole('link', { name: 'Tome suivant' })
                .getAttribute('href'),
        ).toBe('/read/8');
    });

    it('goes back to the series with Escape', async () => {
        await open('rtl');

        press('Escape');

        expect(location).toBe('/series/3');
    });

    it('resumes where the person stopped, and saves each page reached', async () => {
        await open('rtl', '/read/7', { page: 1, completed: false });

        expect(shownPage()).toBe('/api/volumes/7/pages/1');
        // L'adresse suit au rendu suivant.
        await vi.waitFor(() => expect(location).toBe('/read/7?page=2'));

        press('ArrowLeft');
        await vi.waitFor(
            () => expect(saved).toEqual([{ page: 1 }, { page: 2 }]),
            // Marge pour une machine chargée (tests lancés pendant un build).
            { timeout: 3000 },
        );
    });

    it('starts over a volume already read', async () => {
        await open('rtl', '/read/7', { page: 2, completed: true });

        expect(shownPage()).toBe('/api/volumes/7/pages/0');
    });
});
