import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { safeRedirect } from '../src/auth/routes';
import { roleFromGroups } from '../src/auth/sessions';
import { authDeps, fakeOidc, setup, silent } from './helpers';

const PEOPLE = {
    alice: { sub: 'alice-sub', name: 'Alice', groups: ['bento-readers'] },
    bob: { sub: 'bob-sub', name: 'Bob', groups: ['bento-admins', 'other'] },
    eve: { sub: 'eve-sub', name: 'Eve', groups: ['other'] },
};

let ctx: Awaited<ReturnType<typeof setup>>;
let oidc: ReturnType<typeof fakeOidc>;
let api: ReturnType<typeof createApi>;

const build = (publicUrl?: string) =>
    createApi({
        db: ctx.db,
        logger: silent,
        version: '1.0.0',
        scanner: ctx.scanner,
        pages: ctx.pages,
        coversPath: ctx.coversPath,
        auth: { ...authDeps(oidc.client), ...(publicUrl && { publicUrl }) },
    });

beforeEach(async () => {
    ctx = await setup();
    oidc = fakeOidc(PEOPLE);
    api = build();
});

afterEach(async () => {
    await ctx.cleanup();
});

/** Valeur « nom=valeur » d'un cookie posé par la réponse. */
const cookie = (response: Response, name: string) =>
    response.headers
        .getSetCookie()
        .find((c) => c.startsWith(`${name}=`))
        ?.split(';')[0];

/** Parcours complet : page de connexion, Pocket ID, retour dans Bento. */
const login = async (code: string, redirect = '/') => {
    const start = await api.request(
        `/auth/login?redirect=${encodeURIComponent(redirect)}`,
    );
    const authorize = oidc.authorize(start.headers.get('Location')!);
    const callback = await api.request(
        `/auth/callback?code=${code}&state=${authorize.searchParams.get('state')}`,
        { headers: { Cookie: cookie(start, 'bento_oidc')! } },
    );
    return { start, authorize, callback };
};

const me = (session: string | undefined) =>
    api.request('/me', { headers: { Cookie: session ?? '' } });

describe('login', () => {
    it('sends the browser to Pocket ID with PKCE and the groups scope', async () => {
        const { start, authorize } = await login('alice');

        expect(start.status).toBe(302);
        expect(authorize.origin + authorize.pathname).toBe(
            'https://auth.example.com/authorize',
        );
        expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
            response_type: 'code',
            client_id: 'bento',
            redirect_uri: 'http://localhost:5173/api/auth/callback',
            scope: 'openid profile email groups',
            code_challenge_method: 'S256',
        });
        const flowCookie = start.headers.getSetCookie()[0]!;
        expect(flowCookie).toMatch(/HttpOnly/);
        expect(flowCookie).toMatch(/Path=\/api\/auth/);
    });

    it('opens a session and returns to the requested page', async () => {
        const { callback } = await login('alice', '/series/3');

        expect(callback.status).toBe(302);
        expect(callback.headers.get('Location')).toBe('/series/3');
        const session = cookie(callback, 'bento_session');
        const setCookie = callback.headers.getSetCookie().join('\n');
        expect(setCookie).toMatch(/bento_session=[^;]+;.*HttpOnly/);
        expect(setCookie).toMatch(/SameSite=Lax/);
        expect(setCookie).not.toMatch(/Secure/);

        const response = await me(session);
        expect(await response.json()).toMatchObject({
            name: 'Alice',
            role: 'reader',
        });
    });

    it('gives the admin role to the admin group, and follows group changes', async () => {
        const { callback } = await login('bob');
        expect(
            await (await me(cookie(callback, 'bento_session'))).json(),
        ).toMatchObject({ role: 'admin' });

        PEOPLE.bob.groups = ['bento-readers'];
        try {
            const again = await login('bob');
            expect(
                await (
                    await me(cookie(again.callback, 'bento_session'))
                ).json(),
            ).toMatchObject({ role: 'reader' });
        } finally {
            PEOPLE.bob.groups = ['bento-admins', 'other'];
        }
    });

    it('refuses people outside the Bento groups', async () => {
        const { callback } = await login('eve');

        expect(callback.headers.get('Location')).toBe('/denied?reason=group');
        expect(cookie(callback, 'bento_session')).toBeUndefined();
    });

    it('refuses a callback without the matching state', async () => {
        const start = await api.request('/auth/login');
        const flow = cookie(start, 'bento_oidc')!;

        const forged = await api.request(
            '/auth/callback?code=alice&state=forged',
            {
                headers: { Cookie: flow },
            },
        );
        expect(forged.headers.get('Location')).toBe('/denied?reason=expired');

        const noCookie = await api.request('/auth/callback?code=alice&state=x');
        expect(noCookie.headers.get('Location')).toBe('/denied?reason=expired');
    });

    it('reports a code refused by Pocket ID', async () => {
        const { callback } = await login('unknown');

        expect(callback.headers.get('Location')).toBe('/denied?reason=failed');
    });

    it('reports a login cancelled on Pocket ID', async () => {
        const start = await api.request('/auth/login');
        const state = oidc
            .authorize(start.headers.get('Location')!)
            .searchParams.get('state');

        const callback = await api.request(
            `/auth/callback?error=access_denied&state=${state}`,
            { headers: { Cookie: cookie(start, 'bento_oidc')! } },
        );

        expect(callback.headers.get('Location')).toBe(
            '/denied?reason=cancelled',
        );
    });

    it('marks cookies Secure when served over HTTPS', async () => {
        api = build('https://bento.example.com');

        const { callback } = await login('alice');

        expect(callback.headers.getSetCookie().join('\n')).toMatch(
            /bento_session=.*Secure/,
        );
    });
});

describe('logout', () => {
    it('closes the session and gives the Pocket ID logout address', async () => {
        const { callback } = await login('alice');
        const session = cookie(callback, 'bento_session');

        const response = await api.request('/auth/logout', {
            method: 'POST',
            headers: { Cookie: session! },
        });

        const { logoutUrl } = await response.json();
        const url = new URL(logoutUrl);
        expect(url.origin + url.pathname).toBe(
            'https://auth.example.com/end-session',
        );
        expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
            'http://localhost:5173',
        );
        expect((await me(session)).status).toBe(401);
    });
});

describe('safeRedirect', () => {
    it('only allows pages of the app', () => {
        expect(safeRedirect('/series/3?x=1')).toBe('/series/3?x=1');
        expect(safeRedirect('//evil.example.com')).toBe('/');
        expect(safeRedirect('/\\evil.example.com')).toBe('/');
        expect(safeRedirect('https://evil.example.com')).toBe('/');
        expect(safeRedirect('/api/auth/logout')).toBe('/');
        expect(safeRedirect(undefined)).toBe('/');
    });
});

describe('roleFromGroups', () => {
    const groups = { adminGroup: 'bento-admins', readerGroup: 'bento-readers' };

    it('prefers admin, then reader, else nothing', () => {
        expect(roleFromGroups(['bento-readers', 'bento-admins'], groups)).toBe(
            'admin',
        );
        expect(roleFromGroups(['bento-readers'], groups)).toBe('reader');
        expect(roleFromGroups([], groups)).toBeUndefined();
    });
});
