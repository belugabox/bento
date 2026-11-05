import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CurrentUser, UserContext } from '@/services/auth';

import { AppHeader, PreviewBanner } from './AppHeader';

const user = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
    id: 1,
    name: 'Ben',
    email: null,
    role: 'admin',
    maxAge: null,
    preview: null,
    ...overrides,
});

// Requêtes envoyées : [méthode, adresse, corps].
let requests: [string, string, unknown][] = [];
const assign = vi.fn();

const show = (current: CurrentUser) =>
    render(
        <MantineProvider>
            <MemoryRouter>
                <UserContext.Provider value={current}>
                    <AppHeader />
                    <PreviewBanner />
                </UserContext.Provider>
            </MemoryRouter>
        </MantineProvider>,
    );

beforeEach(() => {
    requests = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        requests.push([
            init?.method ?? 'GET',
            String(input),
            init?.body ? JSON.parse(String(init.body)) : undefined,
        ]);
        const body = String(input).endsWith('/drafts/pending')
            ? { series: 3 }
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

describe('AppHeader', () => {
    it('shows admins how many series wait in the drafts', async () => {
        show(user());

        expect(await screen.findByText('3')).toBeTruthy();
        expect(
            screen
                .getByRole('link', { name: 'Brouillons' })
                .getAttribute('href'),
        ).toBe('/drafts');
    });

    it('hides the drafts from readers', () => {
        show(user({ role: 'reader' }));

        expect(screen.queryByRole('link', { name: 'Brouillons' })).toBeNull();
        expect(requests).toEqual([]);
    });

    it('lets an admin view the app as a reader of a given age', async () => {
        show(user());

        fireEvent.click(screen.getByRole('button', { name: 'Mon compte' }));
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
