import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CurrentUser, UserContext } from '@/services/auth';

import { MePage } from './MePage';

const user = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
    id: 1,
    name: 'Ben',
    username: 'ben',
    email: null,
    avatarSeed: null,
    hasPassword: true,
    role: 'admin',
    maxAge: null,
    preview: null,
    ...overrides,
});

// Requêtes envoyées : [méthode, adresse, corps].
let requests: [string, string, unknown][] = [];
// Comptes que l'admin peut simuler.
let accounts: unknown[] = [];
const assign = vi.fn();

const show = (current: CurrentUser, path = '/me') =>
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={[path]}>
                <UserContext.Provider value={current}>
                    <MePage />
                </UserContext.Provider>
            </MemoryRouter>
        </MantineProvider>,
    );

beforeEach(() => {
    requests = [];
    accounts = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        requests.push([
            init?.method ?? 'GET',
            String(input),
            init?.body ? JSON.parse(String(init.body)) : undefined,
        ]);
        const url = String(input);
        const body = url.endsWith('/drafts/pending')
            ? { series: 3 }
            : url.endsWith('/preview/accounts')
              ? accounts
              : { preview: null };
        return new Response(JSON.stringify(body), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, assign },
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    assign.mockReset();
});

describe('MePage', () => {
    it('links the account, the downloads and, for an admin, the admin pages', async () => {
        show(user());

        expect(
            await screen.findByRole('heading', { name: 'Ben' }),
        ).toBeTruthy();
        expect(screen.getByText('Administrateur')).toBeTruthy();
        const sections = screen
            .getAllByRole('region')
            .map((region) => region.getAttribute('aria-label'));
        // « Mon compte » avant ce qui est sur l'appareil (demandé).
        expect(sections).toEqual(
            [
                'Mon compte',
                'Ma lecture',
                'Sur cet appareil',
                'Administration',
                null,
            ].filter((name) => name !== null),
        );
        for (const [name, href] of [
            ['Mon compte', '/account'],
            ['Mes statistiques', '/me/stats'],
            ['Téléchargements', '/downloads'],
            ['Séries', '/manage'],
            ['Brouillons', '/drafts'],
            ['Réglages', '/settings'],
        ]) {
            expect(
                screen
                    .getByRole('link', { name: new RegExp(`^${name}`) })
                    .getAttribute('href'),
            ).toBe(href);
        }
        expect(await screen.findByText('3')).toBeTruthy();
    });

    it('hides the admin pages from readers', () => {
        show(user({ role: 'reader' }));

        expect(screen.getByText('Lecteur')).toBeTruthy();
        expect(screen.queryByText('Administration')).toBeNull();
        expect(screen.queryByText('Voir comme un lecteur…')).toBeNull();
        expect(screen.getByText('Se déconnecter')).toBeTruthy();
    });

    it('lets an admin view the app as a reader of a given age', async () => {
        show(user());

        fireEvent.click(await screen.findByText('Voir comme un lecteur…'));
        // Âge proposé par défaut : 10 ans.
        expect(await screen.findByDisplayValue('Jusqu’à 10 ans')).toBeTruthy();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Voir' }));
        });

        expect(requests).toContainEqual([
            'PUT',
            '/api/preview',
            { maxAge: 10 },
        ]);
        expect(assign).toHaveBeenCalledWith('/');
    });

    it('lets an admin see the app as one account, read-only', async () => {
        accounts = [{ id: 5, name: 'Léa', avatarSeed: null, maxAge: 10 }];
        show(user());

        fireEvent.click(await screen.findByText('Voir comme un lecteur…'));
        expect(
            await screen.findByDisplayValue('Léa · jusqu’à 10 ans'),
        ).toBeTruthy();
        expect(screen.getByText(/rien n’est enregistré/)).toBeTruthy();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Voir' }));
        });

        expect(requests).toContainEqual(['PUT', '/api/preview', { userId: 5 }]);
        expect(assign).toHaveBeenCalledWith('/');
    });
});
