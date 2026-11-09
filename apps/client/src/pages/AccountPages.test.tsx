import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CurrentUser, UserContext } from '@/services/auth';

import { AccountPage } from './AccountPage';
import { JoinPage } from './JoinPage';
import { LoginPage } from './LoginPage';
import { UsersPage } from './UsersPage';

// Requêtes envoyées : [méthode, adresse, corps].
let requests: [string, string, unknown][] = [];
// Réponses du faux serveur, par « MÉTHODE adresse ».
let responses: Record<string, { status?: number; body: unknown }> = {};

let address = '';
const Address = () => {
    const location = useLocation();
    address = location.pathname + location.search;
    return null;
};

const ADMIN: CurrentUser = {
    id: 1,
    name: 'Ben',
    username: 'ben',
    email: null,
    avatarSeed: 'abc',
    hasPassword: true,
    role: 'admin',
    maxAge: null,
    preview: null,
};

const show = (path: string) =>
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={[path]}>
                <UserContext.Provider value={ADMIN}>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/join/:token" element={<JoinPage />} />
                        <Route path="/users" element={<UsersPage />} />
                        <Route path="/account" element={<AccountPage />} />
                        <Route path="*" element={null} />
                    </Routes>
                    <Address />
                </UserContext.Provider>
            </MemoryRouter>
        </MantineProvider>,
    );

beforeEach(() => {
    requests = [];
    responses = {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const method = init?.method ?? 'GET';
        const url = new URL(String(input), 'http://localhost').pathname;
        requests.push([
            method,
            url,
            init?.body ? JSON.parse(String(init.body)) : undefined,
        ]);
        const response = responses[`${method} ${url}`] ?? { body: [] };
        return new Response(JSON.stringify(response.body), {
            status: response.status ?? 200,
            headers: { 'Content-Type': 'application/json' },
        });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

const type = (label: string | RegExp, value: string) =>
    fireEvent.change(screen.getAllByLabelText(label)[0]!, {
        target: { value },
    });

describe('LoginPage', () => {
    it('logs in, then goes back to the requested page', async () => {
        responses['POST /api/auth/login'] = { body: { ok: true } };
        show('/login?redirect=%2Fseries%2F3');

        type(/Identifiant/, 'Léa');
        type(/Mot de passe/, 'un mot de passe');
        fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

        await vi.waitFor(() => expect(address).toBe('/series/3'));
        expect(requests).toContainEqual([
            'POST',
            '/api/auth/login',
            { username: 'Léa', password: 'un mot de passe' },
        ]);
    });

    it('shows a refused login', async () => {
        responses['POST /api/auth/login'] = {
            status: 400,
            body: { message: 'Identifiant ou mot de passe incorrect' },
        };
        show('/login');

        type(/Identifiant/, 'Léa');
        type(/Mot de passe/, 'faux');
        fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

        expect(
            await screen.findByText('Identifiant ou mot de passe incorrect'),
        ).toBeTruthy();
        expect(address).toBe('/login');
    });
});

describe('JoinPage', () => {
    it('creates the account from an invitation', async () => {
        responses['GET /api/auth/links/tok'] = {
            body: {
                kind: 'invite',
                username: null,
                email: null,
                avatarSeed: null,
            },
        };
        responses['POST /api/auth/links/tok'] = { body: { kind: 'invite' } };
        show('/join/tok');

        await screen.findByText('Bienvenue !');
        const create = screen.getByRole('button', { name: 'Créer mon compte' });
        type(/Identifiant/, 'Léa');
        type(/^Mot de passe/, 'un mot de passe');
        type(/Encore une fois/, 'un autre');
        expect(
            screen.getByText('Les deux mots de passe ne sont pas les mêmes'),
        ).toBeTruthy();
        expect((create as HTMLButtonElement).disabled).toBe(true);

        type(/Encore une fois/, 'un mot de passe');
        type(/E-mail/, 'lea@example.com');
        fireEvent.click(create);

        await vi.waitFor(() => expect(address).toBe('/'));
        const [, , body] = requests.find(
            ([method, url]) =>
                method === 'POST' && url === '/api/auth/links/tok',
        )!;
        expect(body).toMatchObject({
            username: 'Léa',
            password: 'un mot de passe',
            email: 'lea@example.com',
            avatarSeed: expect.any(String),
        });
    });

    it('fills in the identifier proposed by the admin', async () => {
        responses['GET /api/auth/links/tok'] = {
            body: {
                kind: 'invite',
                username: 'Léa',
                email: null,
                avatarSeed: null,
            },
        };
        show('/join/tok');

        await screen.findByText('Bienvenue !');
        expect(
            (screen.getAllByLabelText(/Identifiant/)[0] as HTMLInputElement)
                .value,
        ).toBe('Léa');
    });

    it('only asks for a password on a reset link', async () => {
        responses['GET /api/auth/links/tok'] = {
            body: {
                kind: 'reset',
                username: 'Léa',
                email: null,
                avatarSeed: 'abc',
            },
        };
        show('/join/tok');

        await screen.findByText('Nouveau mot de passe');
        expect(screen.queryByLabelText(/Identifiant/)).toBeNull();
        expect(screen.getByText('Léa')).toBeTruthy();
    });

    it('explains an expired link', async () => {
        responses['GET /api/auth/links/tok'] = {
            status: 404,
            body: { message: 'Ce lien est invalide ou a expiré.' },
        };
        show('/join/tok');

        expect(
            await screen.findByText('Ce lien est invalide ou a expiré.'),
        ).toBeTruthy();
    });
});

describe('UsersPage', () => {
    beforeEach(() => {
        responses['GET /api/users'] = {
            body: [
                {
                    id: 1,
                    name: 'Ben',
                    username: 'ben',
                    email: null,
                    avatarSeed: 'abc',
                    role: 'admin',
                    maxAge: null,
                    hasPassword: true,
                    lastLoginAt: null,
                },
                {
                    id: 2,
                    name: 'Zoé Martin',
                    username: null,
                    email: 'zoe@example.com',
                    avatarSeed: null,
                    role: 'reader',
                    maxAge: 12,
                    hasPassword: false,
                    lastLoginAt: null,
                },
            ],
        };
        responses['GET /api/settings'] = {
            body: { settings: { ages: [0, 12, 16] } },
        };
    });

    it('creates an invitation and offers ways to send it', async () => {
        responses['POST /api/invitations'] = {
            body: { id: 1, token: 'tok', expiresAt: '2026-11-16' },
        };
        show('/users');

        fireEvent.click(await screen.findByRole('button', { name: 'Inviter' }));
        fireEvent.click(
            await screen.findByRole('button', { name: 'Créer le lien' }),
        );

        expect(await screen.findByText('Invitation prête')).toBeTruthy();
        expect(requests).toContainEqual([
            'POST',
            '/api/invitations',
            { role: 'reader', maxAge: null, username: null },
        ]);
        expect((screen.getByLabelText('Lien') as HTMLInputElement).value).toBe(
            'http://localhost:3000/join/tok',
        );
        const whatsapp = screen.getByRole('link', { name: /WhatsApp/ });
        expect(whatsapp.getAttribute('href')).toMatch(
            /^https:\/\/wa\.me\/\?text=.*join%2Ftok$/,
        );
        expect(
            screen.getByRole('link', { name: /Texto/ }).getAttribute('href'),
        ).toMatch(/^sms:/);
        expect(
            screen.getByRole('link', { name: /E-mail/ }).getAttribute('href'),
        ).toMatch(/^mailto:/);
    });

    it('proposes an identifier with the invitation', async () => {
        responses['POST /api/invitations'] = {
            body: { id: 1, token: 'tok', expiresAt: '2026-11-16' },
        };
        show('/users');

        fireEvent.click(await screen.findByRole('button', { name: 'Inviter' }));
        const create = await screen.findByRole('button', {
            name: 'Créer le lien',
        });
        type(/Identifiant/, 'a b');
        expect((create as HTMLButtonElement).disabled).toBe(true);
        type(/Identifiant/, 'Léa');
        fireEvent.click(create);

        expect(await screen.findByText('Invitation prête')).toBeTruthy();
        expect(requests).toContainEqual([
            'POST',
            '/api/invitations',
            { role: 'reader', maxAge: null, username: 'Léa' },
        ]);
    });

    it('marks accounts to activate and gives their link', async () => {
        responses['POST /api/users/2/link'] = {
            body: { token: 'act', expiresAt: '2026-11-16' },
        };
        show('/users');

        expect(await screen.findByText('À activer')).toBeTruthy();
        fireEvent.click(
            screen.getByRole('button', { name: 'Actions pour Zoé Martin' }),
        );
        fireEvent.click(await screen.findByText('Lien d’activation'));

        expect(
            await screen.findByText('Activation du compte de Zoé Martin'),
        ).toBeTruthy();
        expect(
            (screen.getByLabelText('Lien') as HTMLInputElement).value,
        ).toMatch(/\/join\/act$/);
    });

    it('does not let the admin change their own role', async () => {
        show('/users');

        const own = await screen.findByRole('textbox', { name: 'Rôle de Ben' });
        expect((own as HTMLInputElement).disabled).toBe(true);
        const other = screen.getByRole('textbox', {
            name: 'Rôle de Zoé Martin',
        });
        expect((other as HTMLInputElement).disabled).toBe(false);
    });
});

describe('AccountPage', () => {
    it('cancels a new avatar, back to the saved one', async () => {
        show('/account');

        const save = screen.getByRole('button', {
            name: 'Enregistrer l’avatar',
        }) as HTMLButtonElement;
        expect(save.disabled).toBe(true);
        expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Idée 1' }));
        expect(save.disabled).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

        expect(save.disabled).toBe(true);
        expect(
            screen.getByAltText('Avatar choisi').getAttribute('src'),
        ).toMatch(/\/api\/avatars\/abc\?/);
    });
});
