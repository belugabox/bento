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
    toRead: index === 0,
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

/** Bloc de la bibliothèque (titre discret), et son nombre. */
const block = (title: string) => screen.queryByRole('region', { name: title });
const countOf = (title: string) =>
    within(block(title)!).getByText(/^· \d+$/).textContent;

/** Cartes dans l'ordre. */
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
        if (url === '/api/readers') return respond(readers);
        if (url.startsWith('/api/series')) return respond(SERIES);
        throw new Error(`requête inattendue : ${url}`);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    readers = [];
});

const show = (path = '/library') =>
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={[path]}>
                <LibraryPage />
                <Location />
            </MemoryRouter>
        </MantineProvider>,
    );

/** Ouvre « Affichage », puis touche un choix. */
const displayChoice = async (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Affichage' }));
    fireEvent.click(await screen.findByRole('radio', { name }));
};

describe('LibraryPage', () => {
    it('lists every series by name, in one grid without titles', async () => {
        show();

        await vi.waitFor(() =>
            expect(titles()).toEqual(['/series/1', '/series/2', '/series/3']),
        );
        // Pas de cartes de reprise (elles sont sur l'accueil).
        expect(screen.queryByLabelText('Tome à reprendre')).toBeNull();
        expect(screen.queryByText(/En cours/)).toBeNull();
        expect(screen.getByText('3 séries')).toBeTruthy();
        // Série commencée : sa barre d'avancement ; lue : marquée.
        expect(
            Number(
                screen
                    .getByLabelText('Avancement')
                    .getAttribute('aria-valuenow'),
            ),
        ).toBeCloseTo(33.3, 0);
        expect(screen.getByLabelText('Série lue')).toBeTruthy();
        expect(screen.getByLabelText('À lire')).toBeTruthy();
    });

    it('groups by reading state: in progress, not read, finished', async () => {
        localStorage.setItem(
            'bento:display',
            JSON.stringify({ libraryGroupBy: 'reading' }),
        );
        show();

        expect(hrefs(await screen.findByTestId('started-grid'))).toEqual([
            '/series/3',
        ]);
        expect(hrefs(screen.getByTestId('unread-grid'))).toEqual(['/series/1']);
        expect(hrefs(screen.getByTestId('read-grid'))).toEqual(['/series/2']);
        expect(countOf('En cours')).toBe('· 1');
        expect(countOf('Déjà lues')).toBe('· 1');
    });

    it('is not grouped by default, even with a grouping of the old home page', async () => {
        localStorage.setItem(
            'bento:display',
            JSON.stringify({ groupBy: 'reading' }),
        );
        show();

        await vi.waitFor(() => expect(titles()).toHaveLength(3));
        expect(screen.queryByText(/En cours/)).toBeNull();
        expect(screen.queryByTestId('started-grid')).toBeNull();
    });

    it('hides the series already read, on this device', async () => {
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        fireEvent.click(screen.getByRole('button', { name: 'Affichage' }));
        fireEvent.click(
            await screen.findByRole('switch', {
                name: 'Masquer les séries lues',
            }),
        );

        await vi.waitFor(() =>
            expect(titles()).toEqual(['/series/1', '/series/3']),
        );
        expect(
            JSON.parse(localStorage.getItem('bento:display')!),
        ).toMatchObject({ hideRead: true });
    });

    it('groups the series by reader, remembered on this device', async () => {
        readers = [{ id: 7, name: 'Léa', avatarSeed: null, seriesIds: [2] }];
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        await displayChoice('Lecteur');

        await vi.waitFor(() => expect(countOf('Lu par Léa')).toBe('· 1'));
        expect(countOf('Lues par personne d’autre')).toBe('· 2');
        expect(
            JSON.parse(localStorage.getItem('bento:display')!),
        ).toMatchObject({ libraryGroupBy: 'reader' });
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

    it('shows covers only, or a list, as chosen', async () => {
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

    it('switches to the list from « Affichage »', async () => {
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
        expect(screen.queryByText('Action, Horreur')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Affichage' }));
        fireEvent.click(await screen.findByLabelText('Liste'));

        expect(await screen.findByText('Action, Horreur')).toBeTruthy();
        expect(JSON.parse(localStorage.getItem('bento:display')!)).toEqual({
            layout: 'list',
        });
    });

    it('sorts by recent additions, in the address', async () => {
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        await displayChoice('Ajouts récents');

        await vi.waitFor(() =>
            expect(titles()).toEqual(['/series/2', '/series/3', '/series/1']),
        );
        expect(location).toBe('?sort=recent');
    });

    it('shows the rating instead of the volumes when sorted by rating', async () => {
        show('/library?sort=rating');

        await vi.waitFor(() => expect(titles()).toHaveLength(3));
        expect(screen.getAllByText('Pas de note')).toHaveLength(3);
    });

    it('filters from the drawer, in the address, with removable chips', async () => {
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
        const genres = await screen.findByRole('group', {
            name: 'Genres et thèmes',
        });
        // Les plus fréquents d'abord, avec leur nombre de séries.
        expect(
            within(genres)
                .getAllByRole('checkbox')
                .map((chip) => chip.closest('div')!.textContent),
        ).toEqual(expect.arrayContaining(['Action 2', 'Sport 1']));
        fireEvent.click(within(genres).getByLabelText(/^Horreur/));
        fireEvent.click(within(genres).getByLabelText(/^Sport/));

        expect(location).toBe('?genre=Horreur&genre=Sport');
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
        fireEvent.click(within(genres).getByLabelText(/^Horreur/));
        await vi.waitFor(() => expect(titles()).toEqual(['/series/3']));
        expect(
            screen.getByRole('button', { name: 'Voir 1 série' }),
        ).toBeTruthy();

        // La pastille sous la barre retire le filtre.
        fireEvent.click(
            screen.getByRole('button', { name: 'Retirer le filtre Sport' }),
        );
        expect(location).toBe('');
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
    });

    it('reads the filters from the address (« Tout voir » of the home page)', async () => {
        show('/library?reading=toread');

        await vi.waitFor(() => expect(titles()).toEqual(['/series/1']));
        expect(
            screen.getByRole('button', { name: 'Retirer le filtre À lire' }),
        ).toBeTruthy();
        expect(screen.getByText('1 série')).toBeTruthy();
    });

    it('says when no series matches the filters', async () => {
        show('/library?reading=new');

        expect(
            await screen.findByText('Aucune série dans ces filtres.'),
        ).toBeTruthy();
        fireEvent.click(
            screen.getByRole('button', { name: 'Effacer les filtres' }),
        );
        await vi.waitFor(() => expect(titles()).toHaveLength(3));
    });

    it('searches, in the address', async () => {
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        fireEvent.change(
            screen.getByRole('searchbox', { name: 'Rechercher une série' }),
            { target: { value: 'gantz' } },
        );
        expect(location).toBe('?q=gantz');
        await vi.waitFor(() =>
            expect(
                vi
                    .mocked(fetch)
                    .mock.calls.some(([url]) =>
                        String(url).includes('search=gantz'),
                    ),
            ).toBe(true),
        );
    });

    it('offers an A–Z index when sorted by name', async () => {
        show();
        await vi.waitFor(() => expect(titles()).toHaveLength(3));

        const index = screen.getByRole('navigation', {
            name: 'Index alphabétique',
        });
        expect(
            within(index)
                .getAllByRole('button')
                .filter((button) => !(button as HTMLButtonElement).disabled)
                .map((button) => button.textContent),
        ).toEqual(['A', 'B', 'C']);

        await displayChoice('Ajouts récents');
        await vi.waitFor(() =>
            expect(
                screen.queryByRole('navigation', {
                    name: 'Index alphabétique',
                }),
            ).toBeNull(),
        );
    });
});
