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
    canInvite: false,
    ...overrides,
});

// Requêtes envoyées : [méthode, adresse, corps].
let requests: [string, string, unknown][] = [];
// Comptes que l'admin peut simuler.
let accounts: unknown[] = [];
// Invitations du lecteur.
let invitations: unknown = { links: [], pending: [], max: 2 };
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
              : url.endsWith('/users/pending')
                ? { count: 2 }
                : url.endsWith('/me/invitations')
                  ? init?.method === 'POST'
                      ? { id: 1, token: 'tok', expiresAt: '2026-11-25' }
                      : invitations
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
    it('lets a reader invite someone, when the admin allows it', async () => {
        invitations = { links: [], pending: [], max: 2 };
        show(user({ role: 'reader', canInvite: true }));

        fireEvent.click(
            await screen.findByRole('button', { name: /Inviter quelqu’un/ }),
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Créer le lien' }),
        );
        expect(
            ((await screen.findByLabelText('Lien')) as HTMLInputElement).value,
        ).toMatch(/\/join\/tok$/);
        expect(requests).toContainEqual([
            'POST',
            '/api/me/invitations',
            { maxAge: null, username: null },
        ]);
    });

    it('stops a reader at two invitations waiting', async () => {
        invitations = {
            links: [
                {
                    id: 1,
                    username: 'Sam',
                    maxAge: 12,
                    createdAt: '2026-11-18',
                    expiresAt: '2026-11-25',
                },
            ],
            pending: [
                { id: 7, name: 'Max', avatarSeed: null, pendingSince: null },
            ],
            max: 2,
        };
        show(user({ role: 'reader', canInvite: true }));

        fireEvent.click(
            await screen.findByRole('button', { name: /Inviter quelqu’un/ }),
        );
        expect(await screen.findByText(/attends que l’admin/)).toBeTruthy();
        expect(screen.getByText(/attend l’admin/)).toBeTruthy();
        expect(
            (
                screen.getByRole('button', {
                    name: 'Créer le lien',
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
    });

    it('hides invitations from a reader when the admin does not allow them', async () => {
        show(user({ role: 'reader' }));
        expect(
            await screen.findByRole('heading', { name: 'Ben' }),
        ).toBeTruthy();
        expect(screen.queryByText(/Inviter quelqu’un/)).toBeNull();
    });

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
