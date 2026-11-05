import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReaderPage } from './ReaderPage';

type Saved = { page?: number; completed?: boolean };

// Couverture, puis pages simples (largeur, hauteur).
const PAGE_SIZES = [
    [20, 30],
    [20, 30],
    [20, 30],
];

const volume = (direction: 'rtl' | 'ltr', progress: Saved | null = null) => ({
    id: 7,
    seriesId: 3,
    seriesName: 'Spy x Family',
    number: '1',
    title: null,
    pageCount: PAGE_SIZES.length,
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
                : String(input).endsWith('/page-sizes')
                  ? PAGE_SIZES
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
const shownPages = () =>
    screen.getAllByAltText(/^Page /).map((img) => img.getAttribute('src'));

/** Écran en paysage (double page automatique). */
const landscape = () =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
        (query: string) =>
            ({
                matches: query.includes('landscape'),
                media: query,
                addEventListener: () => {},
                removeEventListener: () => {},
                addListener: () => {},
                removeListener: () => {},
            }) as unknown as MediaQueryList,
    );

/** Balayage tactile horizontal sur la page affichée. */
const swipe = (fromX: number, toX: number) =>
    act(() => {
        const target = screen.getAllByAltText(/^Page /)[0]!;
        fireEvent.pointerDown(target, {
            pointerId: 1,
            pointerType: 'touch',
            clientX: fromX,
            clientY: 200,
        });
        fireEvent.pointerUp(target, {
            pointerId: 1,
            pointerType: 'touch',
            clientX: toX,
            clientY: 210,
        });
        fireEvent.click(target, { clientX: toX, clientY: 210 });
    });

/** Toucher sans glisser, à l'abscisse donnée (écran de 1024 px). */
const tap = (x: number) =>
    act(() => {
        const target = screen.getAllByAltText(/^Page /)[0]!;
        fireEvent.pointerDown(target, {
            pointerId: 1,
            clientX: x,
            clientY: 200,
        });
        fireEvent.pointerUp(target, { pointerId: 1, clientX: x, clientY: 200 });
        fireEvent.click(target, { clientX: x, clientY: 200 });
    });
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

    it('turns the page with a swipe, following the direction', async () => {
        await open('ltr');

        swipe(600, 300);
        expect(shownPage()).toBe('/api/volumes/7/pages/1');

        swipe(300, 600);
        expect(shownPage()).toBe('/api/volumes/7/pages/0');
    });

    it('turns the page when tapping a side, and ignores the middle', async () => {
        await open('ltr');

        tap(900);
        expect(shownPage()).toBe('/api/volumes/7/pages/1');
        tap(500);
        expect(shownPage()).toBe('/api/volumes/7/pages/1');
        tap(100);
        expect(shownPage()).toBe('/api/volumes/7/pages/0');
    });

    it('shows two pages side by side in landscape, cover alone', async () => {
        landscape();
        await open('ltr');
        expect(shownPages()).toEqual(['/api/volumes/7/pages/0']);

        press('ArrowRight');

        await vi.waitFor(() =>
            expect(shownPages()).toEqual([
                '/api/volumes/7/pages/1',
                '/api/volumes/7/pages/2',
            ]),
        );
        // La progression retient la dernière page affichée.
        await vi.waitFor(() => expect(saved.at(-1)).toEqual({ page: 2 }));
    });

    it('puts the first page on the right when reading right to left', async () => {
        landscape();
        await open('rtl');

        press('ArrowLeft');

        await vi.waitFor(() =>
            expect(shownPages()).toEqual([
                '/api/volumes/7/pages/2',
                '/api/volumes/7/pages/1',
            ]),
        );
    });
});
