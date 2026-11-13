import { MantineProvider } from '@mantine/core';
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from '@testing-library/react';
import {
    MemoryRouter,
    Route,
    Routes,
    useLocation,
    useNavigate,
} from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOOLBAR_HIDE_MS } from './Reader';
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
    // Date du fichier : dans l'adresse des pages.
    version: 1700000000000,
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

/** Ouvre une autre adresse, comme le ferait un lien. */
const GoTo = ({ to }: { to: string }) => {
    const navigate = useNavigate();
    return <button onClick={() => navigate(to)}>Aller</button>;
};

const open = async (
    direction: Mode,
    url = '/read/7',
    progress: Saved | null = null,
    // Autres champs du tome (tome précédent…).
    extra: Record<string, unknown> = {},
) => {
    saved = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const body =
            init?.method === 'PUT'
                ? (saved.push(JSON.parse(String(init.body))),
                  { progress: null })
                : String(input).endsWith('/page-sizes')
                  ? PAGE_SIZES
                  : { ...volume(direction, progress), ...extra };
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
        expect(shownPage()).toBe(
            '/api/volumes/7/pages/0?v=1700000000000&w=800',
        );

        press('ArrowLeft');
        expect(shownPage()).toBe(
            '/api/volumes/7/pages/1?v=1700000000000&w=800',
        );
        expect(location).toBe('/read/7?page=2');

        press('ArrowRight');
        expect(shownPage()).toBe(
            '/api/volumes/7/pages/0?v=1700000000000&w=800',
        );
    });

    it('turns pages with the right arrow when reading a comic', async () => {
        await open('ltr');

        press('ArrowRight');

        expect(shownPage()).toBe(
            '/api/volumes/7/pages/1?v=1700000000000&w=800',
        );
    });

    it('resumes at the page in the address', async () => {
        await open('rtl', '/read/7?page=3');

        expect(shownPage()).toBe(
            '/api/volumes/7/pages/2?v=1700000000000&w=800',
        );
    });

    it('opens the next volume by turning the last page, without an end screen', async () => {
        await open('rtl', '/read/7?page=3');

        press(' ');

        expect(screen.queryByText('Fin du tome')).toBeNull();
        await vi.waitFor(() => expect(location).toBe('/read/8'));
    });

    it('jumps to the first or last page, or to the other volumes, from the bottom bar', async () => {
        await open('ltr', '/read/7?page=2', null, { previousId: 6 });
        const button = (name: string) =>
            screen.getByRole('button', { name }) as HTMLButtonElement;

        fireEvent.click(button('Dernière page'));
        await vi.waitFor(() => expect(location).toBe('/read/7?page=3'));
        expect(button('Dernière page').disabled).toBe(true);
        fireEvent.click(button('Première page'));
        await vi.waitFor(() => expect(location).toBe('/read/7?page=1'));
        expect(button('Première page').disabled).toBe(true);

        // Le tome précédent s'ouvre au début.
        fireEvent.click(button('Tome précédent'));
        await vi.waitFor(() => expect(location).toBe('/read/6'));
    });

    it('opens the next volume from the bottom bar, and greys a missing previous one', async () => {
        await open('ltr');
        expect(
            (
                screen.getByRole('button', {
                    name: 'Tome précédent',
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Tome suivant' }));
        await vi.waitFor(() => expect(location).toBe('/read/8'));
    });

    it('puts the buttons in the reading direction, the volumes outside', async () => {
        const order = () =>
            screen
                .getAllByRole('button', {
                    name: /^(Tome précédent|Première page|Dernière page|Tome suivant)$/,
                })
                .map((b) => b.getAttribute('aria-label'));
        await open('ltr');
        expect(order()).toEqual([
            'Tome précédent',
            'Première page',
            'Dernière page',
            'Tome suivant',
        ]);
        cleanup();
        // De droite à gauche : la fin à gauche, comme le curseur.
        await open('rtl');
        expect(order()).toEqual([
            'Tome suivant',
            'Dernière page',
            'Première page',
            'Tome précédent',
        ]);
    });

    it('keeps only the volume buttons in a webtoon', async () => {
        await open('webtoon');
        expect(
            screen.queryByRole('button', { name: 'Première page' }),
        ).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Dernière page' }),
        ).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Tome suivant' }),
        ).toBeTruthy();
    });

    it('keeps the page number the same width from one page to the next', async () => {
        await open('ltr');
        const label = screen.getByTestId('page-label');
        expect(label.style.fontVariantNumeric).toBe('tabular-nums');
        // « 3 / 3 » : le plus long possible pour 3 pages.
        expect(label.style.minWidth).toBe('5ch');
        press('ArrowRight');
        expect(screen.getByTestId('page-label').style.minWidth).toBe('5ch');
    });

    it('keeps the controls when a page is turned; a tap in the middle hides or shows them', async () => {
        await open('ltr');
        tap(900);
        press('ArrowRight');
        expect(
            screen.getByRole('button', { name: 'Tome suivant' }),
        ).toBeTruthy();
        tap(512);
        expect(
            screen.queryByRole('button', { name: 'Tome suivant' }),
        ).toBeNull();
        tap(512);
        expect(
            screen.getByRole('button', { name: 'Tome suivant' }),
        ).toBeTruthy();
    });

    it('hides the controls after a few seconds, unless the reading settings are open', async () => {
        // Horloge simulée qui avance aussi d'elle-même (chargement du tome).
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            await open('ltr');
            // Commandes cachées puis réaffichées : le délai repart de zéro.
            tap(512);
            tap(512);
            act(() => vi.advanceTimersByTime(TOOLBAR_HIDE_MS - 500));
            expect(screen.getByTestId('page-label')).toBeTruthy();
            act(() => vi.advanceTimersByTime(500));
            expect(screen.queryByTestId('page-label')).toBeNull();

            // Réglages ouverts : les commandes restent.
            tap(512);
            fireEvent.click(
                screen.getByRole('button', { name: 'Réglages de lecture' }),
            );
            act(() => vi.advanceTimersByTime(TOOLBAR_HIDE_MS * 2));
            expect(screen.getByTestId('page-label')).toBeTruthy();
        } finally {
            vi.useRealTimers();
        }
    });

    it('makes the buttons big enough for a tablet', async () => {
        await open('ltr');
        for (const name of [
            'Tome suivant',
            'Première page',
            'Réglages de lecture',
        ]) {
            expect(
                screen.getByRole('button', { name }).getAttribute('data-size'),
            ).toBe('xl');
        }
    });

    it('goes back to the series with Escape', async () => {
        await open('rtl');

        press('Escape');

        expect(location).toBe('/series/3');
    });

    it('goes full screen, and leaves it with the reader', async () => {
        // jsdom n'a pas de plein écran : celui d'un navigateur, simulé.
        let element: Element | null = null;
        const change = () =>
            document.dispatchEvent(new Event('fullscreenchange'));
        Object.defineProperty(document, 'fullscreenEnabled', {
            configurable: true,
            value: true,
        });
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            get: () => element,
        });
        document.documentElement.requestFullscreen = vi.fn(async () => {
            element = document.documentElement;
            change();
        });
        document.exitFullscreen = vi.fn(async () => {
            element = null;
            change();
        });
        await open('rtl');

        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Plein écran' }),
            );
        });
        expect(
            screen.getByRole('button', { name: 'Quitter le plein écran' }),
        ).toBeTruthy();

        press('Escape');
        await vi.waitFor(() =>
            expect(document.exitFullscreen).toHaveBeenCalled(),
        );
        Reflect.deleteProperty(document, 'fullscreenEnabled');
        Reflect.deleteProperty(document, 'fullscreenElement');
    });

    it('resumes where the person stopped', async () => {
        await open('rtl', '/read/7', { page: 1, completed: false });

        expect(shownPage()).toBe(
            '/api/volumes/7/pages/1?v=1700000000000&w=800',
        );
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

        expect(shownPage()).toBe(
            '/api/volumes/7/pages/0?v=1700000000000&w=800',
        );
    });

    it('turns the page with a swipe, following the direction', async () => {
        await open('ltr');

        swipe(600, 300);
        expect(shownPage()).toBe(
            '/api/volumes/7/pages/1?v=1700000000000&w=800',
        );

        swipe(300, 600);
        expect(shownPage()).toBe(
            '/api/volumes/7/pages/0?v=1700000000000&w=800',
        );
    });

    it('turns the page when tapping a side, and ignores the middle', async () => {
        await open('ltr');

        tap(900);
        expect(shownPage()).toBe(
            '/api/volumes/7/pages/1?v=1700000000000&w=800',
        );
        tap(500);
        expect(shownPage()).toBe(
            '/api/volumes/7/pages/1?v=1700000000000&w=800',
        );
        tap(100);
        expect(shownPage()).toBe(
            '/api/volumes/7/pages/0?v=1700000000000&w=800',
        );
    });

    it('shows two pages side by side in landscape, cover alone', async () => {
        landscape();
        await open('ltr');
        expect(shownPages()).toEqual([
            '/api/volumes/7/pages/0?v=1700000000000&w=800',
        ]);
        await vi.waitFor(() => expect(location).toBe('/read/7?page=1'));

        press('ArrowRight');

        await vi.waitFor(() =>
            expect(shownPages()).toEqual([
                '/api/volumes/7/pages/1?v=1700000000000&w=800',
                '/api/volumes/7/pages/2?v=1700000000000&w=800',
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
                '/api/volumes/7/pages/2?v=1700000000000&w=800',
                '/api/volumes/7/pages/1?v=1700000000000&w=800',
            ]),
        );
    });

    it('turns manga pages left to right, first page of a spread on the right', async () => {
        landscape();
        await open('ltr-manga');

        press('ArrowRight');

        await vi.waitFor(() =>
            expect(shownPages()).toEqual([
                '/api/volumes/7/pages/2?v=1700000000000&w=800',
                '/api/volumes/7/pages/1?v=1700000000000&w=800',
            ]),
        );
    });

    it('scrolls a webtoon: every page in a column, no page slider', async () => {
        await open('webtoon');

        await vi.waitFor(() =>
            expect(shownPages()).toEqual([
                '/api/volumes/7/pages/0?v=1700000000000&w=800',
                '/api/volumes/7/pages/1?v=1700000000000&w=800',
                '/api/volumes/7/pages/2?v=1700000000000&w=800',
            ]),
        );
        expect(screen.queryByRole('slider')).toBeNull();
        // Sous la dernière page : le tome suivant, sans « Fin du tome ».
        expect(screen.queryByText('Fin du tome')).toBeNull();
        expect(
            screen
                .getByRole('link', { name: 'Tome suivant' })
                .getAttribute('href'),
        ).toBe('/read/8');
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
                    <GoTo to="/read/8" />
                </MemoryRouter>
            </MantineProvider>,
        );
        await vi.waitFor(() =>
            expect(scrolled).toContain(
                '/api/volumes/7/pages/2?v=1700000000000&w=800',
            ),
        );

        // Tome suivant ouvert (plus de bouton en fin de webtoon).
        fireEvent.click(screen.getByRole('button', { name: 'Aller' }));

        await vi.waitFor(() =>
            expect(scrolled.at(-1)).toBe(
                '/api/volumes/8/pages/0?v=1700000000000&w=800',
            ),
        );
        await vi.waitFor(() => expect(location).toBe('/read/8?page=1'));
    });
});
