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

type Mode = 'rtl' | 'ltr' | 'ltr-manga' | 'webtoon';

const volume = (mode: Mode, progress: Saved | null = null) => ({
    id: 7,
    seriesId: 3,
    seriesName: 'Spy x Family',
    number: '1',
    title: null,
    pageCount: PAGE_SIZES.length,
    libraryType: mode === 'ltr' ? 'comics' : 'manga',
    readingMode: mode,
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
    direction: Mode,
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
    await screen.findAllByAltText(/^Page /);
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

    it('resumes where the person stopped', async () => {
        await open('rtl', '/read/7', { page: 1, completed: false });

        expect(shownPage()).toBe('/api/volumes/7/pages/1');
        // L'adresse suit au rendu suivant.
        await vi.waitFor(() => expect(location).toBe('/read/7?page=2'));
    });

    it('saves each page reached once a few pages were read', async () => {
        await open('rtl');
        await vi.waitFor(() => expect(location).toBe('/read/7?page=1'));

        press('ArrowLeft');
        await vi.waitFor(() => expect(location).toBe('/read/7?page=2'));
        // Deux pages vues : le tome n'est pas encore commencé.
        expect(saved).toEqual([]);

        press('ArrowLeft');
        press('ArrowRight');
        await vi.waitFor(
            () => expect(saved).toEqual([{ page: 2 }, { page: 1 }]),
            // Marge pour une machine chargée (tests lancés pendant un build).
            { timeout: 3000 },
        );
    });

    it('does not mark a volume read when arriving on its last page', async () => {
        await open('rtl', '/read/7?page=last');
        await vi.waitFor(() => expect(location).toBe('/read/7?page=3'));

        press('ArrowRight');
        await vi.waitFor(() => expect(location).toBe('/read/7?page=2'));

        expect(saved).toEqual([]);
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
        await vi.waitFor(() => expect(location).toBe('/read/7?page=1'));

        press('ArrowRight');

        await vi.waitFor(() =>
            expect(shownPages()).toEqual([
                '/api/volumes/7/pages/1',
                '/api/volumes/7/pages/2',
            ]),
        );
        // Les deux pages comptent : trois pages vues, la progression
        // retient la dernière affichée.
        await vi.waitFor(() => expect(saved).toEqual([{ page: 2 }]));
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

    it('turns manga pages left to right, first page of a spread on the right', async () => {
        landscape();
        await open('ltr-manga');

        press('ArrowRight');

        await vi.waitFor(() =>
            expect(shownPages()).toEqual([
                '/api/volumes/7/pages/2',
                '/api/volumes/7/pages/1',
            ]),
        );
    });

    it('scrolls a webtoon: every page in a column, no page slider', async () => {
        await open('webtoon');

        await vi.waitFor(() =>
            expect(shownPages()).toEqual([
                '/api/volumes/7/pages/0',
                '/api/volumes/7/pages/1',
                '/api/volumes/7/pages/2',
            ]),
        );
        expect(screen.queryByRole('slider')).toBeNull();
        expect(screen.getByText('Fin du tome')).toBeTruthy();
        // Les flèches ne tournent pas de page : le défilement reste natif.
        await vi.waitFor(() => expect(location).toBe('/read/7?page=1'));
        press('ArrowRight');
        expect(location).toBe('/read/7?page=1');
    });

    it('starts the next webtoon volume at its top', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            const id = Number(/volumes\/(\d+)/.exec(url)![1]);
            const body = url.endsWith('/page-sizes')
                ? PAGE_SIZES
                : url.endsWith('/progress')
                  ? { progress: null }
                  : {
                        // Tome 7 repris en cours de lecture.
                        ...volume(
                            'webtoon',
                            id === 7 ? { page: 2, completed: false } : null,
                        ),
                        id,
                        previousId: id === 8 ? 7 : null,
                        nextId: id === 7 ? 8 : null,
                    };
            return new Response(JSON.stringify(body), {
                headers: { 'Content-Type': 'application/json' },
            });
        });
        const scrolled: (string | null)[] = [];
        vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(
            function (this: Element) {
                scrolled.push(this.getAttribute('src'));
            },
        );
        render(
            <MantineProvider>
                <MemoryRouter initialEntries={['/read/7']}>
                    <Routes>
                        <Route path="/read/:id" element={<ReaderPage />} />
                    </Routes>
                    <Location />
                </MemoryRouter>
            </MantineProvider>,
        );
        await vi.waitFor(() =>
            expect(scrolled).toContain('/api/volumes/7/pages/2'),
        );

        fireEvent.click(await screen.findByText('Tome suivant'));

        await vi.waitFor(() =>
            expect(scrolled.at(-1)).toBe('/api/volumes/8/pages/0'),
        );
        await vi.waitFor(() => expect(location).toBe('/read/8?page=1'));
    });
});
