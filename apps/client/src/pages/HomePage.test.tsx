import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomePage } from './HomePage';

const SERIES = [
    // En cours (tome 42).
    { name: 'Akira', readCount: 1, startedCount: 2, newCount: 0 },
    // Deux tomes ajoutés depuis la dernière lecture.
    { name: 'Berserk', readCount: 3, startedCount: 3, newCount: 2 },
    { name: 'Coq de combat', toRead: true },
    // Lue par Léa.
    { name: 'Dragon Ball' },
    { name: 'Eden' },
].map((s, index) => ({
    id: index + 1,
    libraryId: 1,
    year: null,
    status: null,
    volumeCount: 5,
    readCount: 0,
    startedCount: 0,
    coverUpdatedAt: null,
    coverVolumeId: index + 10,
    genres: [],
    lastAddedAt: `2026-0${index + 1}-01T00:00:00.000Z`,
    ...s,
}));

const RESUME = [
    {
        volumeId: 42,
        version: 1,
        seriesId: 1,
        seriesName: 'Akira',
        number: '2',
        title: null,
        page: 44,
        pageCount: 190,
        readCount: 1,
        volumeCount: 5,
        newCount: 0,
    },
    // Suite d'une série entamée : tome pas encore ouvert.
    {
        volumeId: 51,
        version: 1,
        seriesId: 2,
        seriesName: 'Berserk',
        number: '4',
        title: null,
        page: null,
        pageCount: 20,
        readCount: 3,
        volumeCount: 5,
        newCount: 2,
    },
];

let resume: unknown[] = RESUME;
let series: unknown[] = SERIES;
// Bien notées, jamais ouvertes (serveur).
let gems: unknown[] = [];

const respond = (body: unknown) =>
    new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });

beforeEach(() => {
    resume = RESUME;
    series = SERIES;
    gems = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url === '/api/continue') return respond(resume);
        if (url === '/api/readers') {
            return respond([
                { id: 7, name: 'Léa', avatarSeed: null, seriesIds: [4] },
            ]);
        }
        if (url === '/api/suggestions/gems') return respond(gems);
        if (url.startsWith('/api/stats/me')) {
            return respond({ seconds: 12_000, completed: 2 });
        }
        if (url.startsWith('/api/series')) return respond(series);
        throw new Error(`requête inattendue : ${url}`);
    });
});

afterEach(() => vi.restoreAllMocks());

const show = () =>
    render(
        <MantineProvider>
            <MemoryRouter>
                <HomePage />
            </MemoryRouter>
        </MantineProvider>,
    );

const block = (title: string) => screen.getByRole('region', { name: title });
const hrefs = (zone: HTMLElement) =>
    within(zone)
        .queryAllByRole('link')
        .map((link) => link.getAttribute('href'));

describe('HomePage', () => {
    it('shows the last volume in big, the others beside it', async () => {
        show();

        const continueLink = await screen.findByRole('link', {
            name: 'Continuer',
        });
        expect(continueLink.getAttribute('href')).toBe('/read/42');
        expect(screen.getByText('Tome 2 · page 45 / 190')).toBeTruthy();
        // L'avancement : celui de la série (1 tome lu sur 5, plus le quart
        // du tome 2), pas celui du tome.
        expect(
            screen.getByText('1 tome lu sur 5 · 25 % de la série'),
        ).toBeTruthy();
        // Tome suivant pas encore ouvert : « à commencer ».
        const resumeZone = screen.getByTestId('resume');
        expect(hrefs(resumeZone)).toContain('/read/51');
        expect(
            within(resumeZone).getByText('T4 · à commencer · 3 / 5 lus'),
        ).toBeTruthy();
    });

    it('shows one-row blocks, each leading to the filtered library', async () => {
        show();
        await screen.findByRole('link', { name: 'Continuer' });

        // Berserk est en cours : pas dans « Nouveaux tomes » (jamais à deux
        // endroits).
        expect(
            screen.queryByRole('region', { name: 'Nouveaux tomes' }),
        ).toBeNull();
        expect(hrefs(block('À lire'))).toContain('/series/3');
        const family = block('Lu par la famille');
        expect(hrefs(family)).toContain('/series/4');
        expect(within(family).getByText('Lu par Léa')).toBeTruthy();
        expect(hrefs(block('Récemment ajoutés'))).toContain('/series/5');

        expect(
            screen
                .getByRole('link', { name: 'Tout voir : À lire' })
                .getAttribute('href'),
        ).toBe('/library?reading=toread');
        expect(
            screen
                .getByRole('link', { name: 'Tout voir : Lu par la famille' })
                .getAttribute('href'),
        ).toBe('/library?reading=unread&reader=7');
        expect(
            screen
                .getByRole('link', { name: 'Tout voir : En cours' })
                .getAttribute('href'),
        ).toBe('/library?sort=lastRead&reading=started');
    });

    it('shows the new volumes of a series not in progress', async () => {
        resume = [RESUME[0]];
        show();

        const fresh = await screen.findByRole('region', {
            name: 'Nouveaux tomes',
        });
        expect(hrefs(fresh)).toContain('/series/2');
        expect(within(fresh).getByText('+2 · 3 / 5 lus')).toBeTruthy();
    });

    it('leads to the whole library, without the reading of the week', async () => {
        show();

        const library = await screen.findByRole('link', {
            name: 'Toute la bibliothèque',
        });
        expect(library.getAttribute('href')).toBe('/library');
        expect(library.textContent).toContain('5 séries · 25 tomes');
        // La lecture de la semaine est dans « Moi ».
        expect(screen.queryByText(/de lecture cette semaine/)).toBeNull();
    });

    it('suggests series like the ones read, and says why', async () => {
        // Berserk lu ; Eden partage son genre, Coq de combat non.
        series = SERIES.map((s) =>
            s.name === 'Berserk' || s.name === 'Eden'
                ? { ...s, genres: ['Fantasy'] }
                : s,
        );
        show();

        const mine = await screen.findByRole('region', { name: 'Pour toi' });
        expect(hrefs(mine)).toEqual(['/library?reading=foryou', '/series/5']);
        expect(within(mine).getByText('Comme Berserk')).toBeTruthy();
        // Jamais à deux endroits sur l'accueil.
        expect(
            screen
                .getAllByRole('link')
                .filter((link) => link.getAttribute('href') === '/series/5'),
        ).toHaveLength(1);
    });

    it('shows the well rated series nobody opened, with their rating', async () => {
        gems = [{ id: 5, rating: 4.6, reviews: 230 }];
        show();

        const rated = await screen.findByRole('region', {
            name: 'Bien notés, jamais ouverts',
        });
        expect(hrefs(rated)).toContain('/series/5');
        expect(within(rated).getByText('★ 4,6 · 230 avis')).toBeTruthy();
    });

    it('leads from « Pour toi » to the library, filtered on the suggestions', async () => {
        series = SERIES.map((s) =>
            s.name === 'Berserk' || s.name === 'Eden'
                ? { ...s, genres: ['Fantasy'] }
                : s,
        );
        show();

        expect(
            (
                await screen.findByRole('link', {
                    name: 'Tout voir : Pour toi',
                })
            ).getAttribute('href'),
        ).toBe('/library?reading=foryou');
    });

    it('says when the library is empty', async () => {
        resume = [];
        series = [];
        show();

        expect(await screen.findByText('Bibliothèque vide.')).toBeTruthy();
    });
});
