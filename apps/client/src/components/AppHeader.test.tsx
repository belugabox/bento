import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CurrentUser, UserContext } from '@/services/auth';

import { AppHeader, PreviewBanner, ProductionCopyBanner } from './AppHeader';

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
// Tâches de fond renvoyées par le serveur.
let tasks: unknown[] = [];
const assign = vi.fn();
// Copie de la prod sans fichiers (`/api/health`).
let health = false;

let address = '';
const Address = () => {
    const location = useLocation();
    address = location.pathname + location.search;
    return null;
};

const show = (current: CurrentUser, path = '/') =>
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={[path]}>
                <UserContext.Provider value={current}>
                    <AppHeader />
                    <PreviewBanner />
                    <ProductionCopyBanner />
                    <Address />
                </UserContext.Provider>
            </MemoryRouter>
        </MantineProvider>,
    );

beforeEach(() => {
    requests = [];
    tasks = [];
    accounts = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        requests.push([
            init?.method ?? 'GET',
            String(input),
            init?.body ? JSON.parse(String(init.body)) : undefined,
        ]);
        const url = String(input);
        const body = url.endsWith('/health')
            ? { status: 'ok', version: '1', offlineLibraries: health }
            : url.endsWith('/drafts/pending')
              ? { series: 3 }
              : url.endsWith('/tasks')
                ? tasks
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
    health = false;
    assign.mockReset();
});

describe('AppHeader', () => {
    it('opens the library search from the magnifier', async () => {
        show(user({ role: 'reader' }), '/series/4');

        fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
        expect(address).toBe('/library');
    });

    it('links the main pages, and « Moi » from the avatar', () => {
        show(user({ role: 'reader' }), '/library?genre=Action');

        expect(
            screen
                .getByRole('link', { name: 'Bibliothèque' })
                .getAttribute('aria-current'),
        ).toBe('page');
        expect(
            screen.getByRole('link', { name: 'Accueil' }).getAttribute('href'),
        ).toBe('/');
        expect(
            screen.getByRole('link', { name: 'Moi' }).getAttribute('href'),
        ).toBe('/me');
    });

    it('shows admins how many series wait in the drafts', async () => {
        show(user());

        expect(await screen.findByText('3')).toBeTruthy();
        expect(
            screen
                .getByRole('link', { name: 'Brouillons' })
                .getAttribute('href'),
        ).toBe('/drafts');
    });

    it('shows admins the background tasks and their progress', async () => {
        tasks = [
            {
                id: 1,
                label: 'Scan de « Mangas »',
                done: 30,
                total: 120,
                startedAt: 0,
            },
        ];
        show(user());

        fireEvent.click(
            await screen.findByRole('button', { name: '1 tâche(s) en cours' }),
        );

        expect(await screen.findByText('Scan de « Mangas »')).toBeTruthy();
        expect(screen.getByText('30 / 120')).toBeTruthy();
    });

    it('hides the drafts from readers', () => {
        show(user({ role: 'reader' }));

        expect(screen.queryByRole('link', { name: 'Brouillons' })).toBeNull();
        // Rien de l'admin (brouillons, tâches) ; l'état du serveur, oui.
        expect(requests.filter(([, url]) => url !== '/api/health')).toEqual([]);
    });

    it('says when the server is a copy of the production without files', async () => {
        health = true;
        show(user());

        expect(await screen.findByText(/Copie de la prod/)).toBeTruthy();
    });

    it('says nothing on a normal server', async () => {
        show(user());

        await screen.findByText('3');
        expect(screen.queryByText(/Copie de la prod/)).toBeNull();
    });

    it('reminds a simulated account', () => {
        show(
            user({
                id: 5,
                name: 'Léa',
                role: 'reader',
                maxAge: 10,
                preview: { maxAge: 10, user: { id: 5, name: 'Léa' } },
            }),
        );

        expect(screen.getByText(/en lecture seule/)).toBeTruthy();
        expect(screen.getByText('Léa')).toBeTruthy();
    });

    it('reminds the reader view, and goes back to the admin view', async () => {
        show(user({ role: 'reader', maxAge: 10, preview: { maxAge: 10 } }));

        expect(screen.getByText(/Vue lecteur : jusqu’à 10 ans/)).toBeTruthy();
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Revenir à la vue admin' }),
            );
        });

        expect(requests).toContainEqual(['DELETE', '/api/preview', undefined]);
        expect(assign).toHaveBeenCalledWith('/');
    });
});
