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

// Filtre « Lu par » : les autres comptes et leurs séries lues.
let readers: unknown[] = [];

let location = '';
const Location = () => {
    location = useLocation().search;
    return null;
};

/** Titre d'un bloc de l'accueil (couleur principale), et son nombre. */
const block = (title: string) => screen.queryByRole('region', { name: title });
const countOf = (title: string) =>
    within(block(title)!).getByText(/^· \d+$/).textContent;

/** Cartes de l'accueil dans l'ordre (les trois blocs de la grille). */
const hrefs = (zone: HTMLElement) =>
    within(zone)
        .queryAllByRole('link')
        .map((link) => link.getAttribute('href'));
const titles = () => hrefs(screen.getByTestId('series-grid'));

beforeEach(() => {
    localStorage.clear();
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
                    // Deux tomes ajoutés depuis la dernière lecture.
                    newCount: 2,
                },
            ]);
        }
        if (url === '/api/readers') return respond(readers);
        if (url.startsWith('/api/series')) return respond(SERIES);
        throw new Error(`requête inattendue : ${url}`);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    readers = [];
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
    it('shows what to resume, then the other series, in one grid', async () => {
        show();

        // Le tome en cours, et l'avancement dans la série.
        expect(await screen.findByText('T2 · 1/3 lus')).toBeTruthy();
        // Un tome lu sur trois, plus la moitié du deuxième.
        expect(
            screen
                .getAllByLabelText('Avancement')[0]!
                .getAttribute('aria-valuenow'),
        ).toBe('50');
        // Tomes à reprendre d'abord, puis les séries qu'ils ne montrent pas
        // déjà ; pas de titre de zone.
        await vi.waitFor(() =>
            expect(titles()).toEqual(['/read/42', '/read/51', '/series/2']),
        );
        expect(screen.queryByText('Reprendre la lecture')).toBeNull();
        // Tomes à reprendre : marqués d'un ▶ (et d'un contour).
        expect(screen.getAllByLabelText('Tome à reprendre')).toHaveLength(2);
        expect(screen.queryByText('Séries')).toBeNull();
        // Les icônes sont dans le lien de la carte : un clic l'ouvre.
        expect(
            screen.getAllByLabelText('Tome à reprendre')[0]!.closest('a'),
        ).toBeTruthy();
        // Série entièrement lue : marquée, à la fin, légèrement grisée.
        const read = screen.getByLabelText('Série lue');
        expect(read.closest('[style*="opacity"]')).toBeTruthy();
        // Le scan n'est plus sur l'accueil.
        expect(screen.queryByRole('button', { name: /scanner/i })).toBeNull();
    });

    it('splits the grid: in progress, not read, finished', async () => {
        // Série 2 lue en entier : elle passe dans le dernier bloc.
        show();

        expect(hrefs(await screen.findByTestId('resume-grid'))).toEqual([
            '/read/42',
            '/read/51',
        ]);
        expect(screen.queryByTestId('unread-grid')).toBeNull();
        expect(hrefs(screen.getByTestId('read-grid'))).toEqual(['/series/2']);
        // Un titre discret par bloc, avec son nombre de cartes.
        expect(countOf('En cours')).toBe('· 2');
        expect(countOf('Déjà lues')).toBe('· 1');
        expect(screen.queryByText(/À découvrir/)).toBeNull();
    });

    it('hides the series already read, on this device', async () => {
        show();
        await vi.waitFor(() =>
            expect(titles()).toEqual(['/read/42', '/read/51', '/series/2']),
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Trier les séries' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Masquer' }),
        );

        await vi.waitFor(() =>
            expect(titles()).toEqual(['/read/42', '/read/51']),
        );
        expect(
            JSON.parse(localStorage.getItem('bento:display')!),
        ).toMatchObject({
            hideRead: true,
        });
    });

    it('groups the series by reader, remembered on this device', async () => {
        readers = [{ id: 7, name: 'Léa', avatarSeed: null, seriesIds: [2] }];
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        fireEvent.click(
            screen.getByRole('button', { name: 'Grouper les séries' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Lecteur' }),
        );

        await vi.waitFor(() => expect(countOf('Lu par Léa')).toBe('· 1'));
        // Pas de bloc « En cours » : les séries en cours sont dans leur bloc,
        // avec leur carte de reprise (jamais à deux endroits).
        expect(block('En cours')).toBeNull();
        expect(
            within(block('Lues par personne d’autre')!)
                .getAllByRole('link')
                .map((link) => link.getAttribute('href')),
        ).toEqual(['/read/51', '/read/42']);
        expect(
            JSON.parse(localStorage.getItem('bento:display')!),
        ).toMatchObject({ groupBy: 'reader' });
        // Plus de filtre « Lu par » dans la barre.
        expect(
            screen.queryByRole('button', { name: 'Filtrer par lecteur' }),
        ).toBeNull();
    });

    it('loads the series of the last library without waiting', async () => {
        localStorage.setItem('bento:library', '1');
        // Liste des bibliothèques qui ne répond pas : les séries viennent
        // quand même.
        const answer = vi.mocked(fetch).getMockImplementation()!;
        vi.mocked(fetch).mockImplementation((input, init) =>
            String(input) === '/api/libraries'
                ? new Promise<Response>(() => undefined)
                : answer(input, init),
        );
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
    });

    it('remembers the library on this device', async () => {
        show();
        await vi.waitFor(() =>
            expect(localStorage.getItem('bento:library')).toBe('1'),
        );
    });

    it('shows no titles when grouping by nothing', async () => {
        localStorage.setItem(
            'bento:display',
            JSON.stringify({ groupBy: 'none' }),
        );
        show();

        // Une seule grille, dans l'ordre du tri (en cours compris).
        await vi.waitFor(() =>
            expect(titles()).toEqual(['/read/51', '/read/42', '/series/2']),
        );
        expect(screen.queryByText(/En cours/)).toBeNull();
        expect(screen.queryByText(/Déjà lues/)).toBeNull();
    });

    it('shows covers only, or a list, as chosen in Appearance', async () => {
        localStorage.setItem(
            'bento:display',
            JSON.stringify({ coversOnly: true }),
        );
        const { unmount } = show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
        expect(screen.getByAltText('Berserk')).toBeTruthy();
        expect(screen.queryByText('Berserk')).toBeNull();
        unmount();

        localStorage.setItem(
            'bento:display',
            JSON.stringify({ layout: 'list' }),
        );
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
        expect(screen.getByText('Berserk')).toBeTruthy();
        // Infos en plus : les genres de chaque série.
        expect(screen.getByText('Action, Horreur')).toBeTruthy();
    });

    it('switches between grid and list from the bottom bar', async () => {
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
        expect(screen.queryByText('Action, Horreur')).toBeNull();

        fireEvent.click(screen.getByLabelText('Liste'));
        expect(await screen.findByText('Action, Horreur')).toBeTruthy();
        expect(JSON.parse(localStorage.getItem('bento:display')!)).toEqual({
            layout: 'list',
        });
    });

    it('sorts by recent additions, in the address', async () => {
        show();
        await screen.findByTestId('series-grid');
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        fireEvent.click(
            screen.getByRole('button', { name: 'Trier les séries' }),
        );
        fireEvent.click(await screen.findByText('Ajouts récents'));
        await vi.waitFor(() => expect(location).toBe('?sort=recent'));
        expect(titles()).toEqual(['/read/42', '/read/51', '/series/2']);
        // Plus de menu « Lecture ».
        expect(
            screen.queryByRole('button', { name: 'État de lecture' }),
        ).toBeNull();
    });

    it('resumes with the next volume of a series, in the same row', async () => {
        show();

        // Pastille des tomes ajoutés depuis la dernière lecture.
        expect(
            (await screen.findByLabelText('2 nouveaux tomes')).textContent,
        ).toBe('+2');

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

    it('filters by genre with chips, the most frequent first', async () => {
        show();
        await screen.findByTestId('series-grid');
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        // Trois pastilles, les genres aux plus de séries d'abord ; les autres
        // dans « Plus », avec leur nombre de séries.
        const genres = within(screen.getByLabelText('Genres'))
            .getAllByRole('button')
            .map((button) => button.textContent);
        expect(genres).toEqual(['Action', 'Horreur', 'Aventure', 'Plus']);

        fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
        const more = await screen.findAllByRole('menuitem');
        expect(more.map((item) => item.textContent)).toEqual([
            'Comédie1',
            'Drame1',
            'Fantasy1',
            'Sport1',
        ]);
        fireEvent.click(more[3]!);
        await vi.waitFor(() => expect(titles()).toEqual(['/read/42']));
        expect(location).toBe('?genre=Sport');
        // Genre choisi dans « Plus » : montré en pastille, qui le retire.
        fireEvent.click(screen.getByRole('button', { name: 'Sport' }));
        await vi.waitFor(() => expect(location).toBe(''));
    });

    it('offers every genre in one menu on narrow screens', async () => {
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
        fireEvent.click(
            screen.getByRole('button', { name: 'Choisir un genre' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: /^Sport/ }),
        );
        await vi.waitFor(() => expect(location).toBe('?genre=Sport'));
        fireEvent.click(
            screen.getByRole('button', { name: 'Choisir un genre' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Tous les genres' }),
        );
        await vi.waitFor(() => expect(location).toBe(''));
    });

    it('removes a genre chip with a second click', async () => {
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
        fireEvent.click(screen.getByRole('button', { name: 'Horreur' }));
        await vi.waitFor(() =>
            expect(titles()).toEqual(['/read/51', '/series/2']),
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
