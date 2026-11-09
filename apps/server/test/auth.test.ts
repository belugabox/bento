import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { adminLink, recoveryLink } from '../src/auth/links';
import { LoginLimiter } from '../src/auth/loginLimiter';
import { hashPassword, verifyPassword } from '../src/auth/passwords';
import { safeRedirect } from '../src/auth/rules';
import { createSession } from '../src/auth/sessions';
import { users } from '../src/db/schema';
import { authDeps, sessionCookie, setup, silent } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;

const build = (publicUrl?: string) =>
    createApi({
        db: ctx.db,
        logger: silent,
        version: '1.0.0',
        scanner: ctx.scanner,
        pages: ctx.pages,
        coversPath: ctx.coversPath,
        files: ctx.files,
        covers: ctx.covers,
        wikipedia: ctx.wikipedia,
        auth: { ...authDeps(), ...(publicUrl && { publicUrl }) },
    });

beforeEach(async () => {
    ctx = await setup();
    api = build();
    admin = sessionCookie(ctx.db, 'admin', 'admin');
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

const call = (
    path: string,
    {
        method = 'GET',
        session,
        body,
    }: {
        method?: string;
        session?: string;
        body?: unknown;
    } = {},
) =>
    api.request(path, {
        method,
        headers: {
            Cookie: session ?? '',
            ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

const me = async (session: string | undefined) =>
    (await call('/me', { session })).json();

const invite = async (role: 'admin' | 'reader' = 'reader', maxAge = 12) =>
    (
        (await (
            await call('/invitations', {
                method: 'POST',
                session: admin,
                body: { role, maxAge },
            })
        ).json()) as { token: string }
    ).token;

const join = (token: string, body: Record<string, unknown>) =>
    call(`/auth/links/${token}`, { method: 'POST', body });

const login = (username: string, password: string) =>
    call('/auth/login', { method: 'POST', body: { username, password } });

/** Compte venu de Pocket ID : ni identifiant ni mot de passe. */
const legacyAccount = (name: string, role: 'admin' | 'reader' = 'reader') =>
    ctx.db
        .insert(users)
        .values({ name, role, email: `${name}@example.com` })
        .returning({ id: users.id })
        .get().id;

describe('invitations', () => {
    it('creates the account, opens a session, and works only once', async () => {
        const token = await invite('reader', 12);

        expect(await (await call(`/auth/links/${token}`)).json()).toEqual({
            kind: 'invite',
            username: null,
            email: null,
            avatarSeed: null,
        });

        const response = await join(token, {
            username: 'Léa',
            password: 'un mot de passe',
            email: 'lea@example.com',
            avatarSeed: 'abc',
        });
        expect(response.status).toBe(200);
        expect(await me(cookie(response, 'bento_session'))).toMatchObject({
            name: 'Léa',
            username: 'léa',
            email: 'lea@example.com',
            avatarSeed: 'abc',
            hasPassword: true,
            role: 'reader',
            maxAge: 12,
        });

        expect((await call(`/auth/links/${token}`)).status).toBe(404);
        expect(
            (await join(token, { username: 'Autre', password: 'abcdefgh' }))
                .status,
        ).toBe(404);
    });

    it('checks the identifier and the password', async () => {
        const token = await invite();

        expect(
            (await join(token, { username: 'x', password: 'abcdefgh' })).status,
        ).toBe(400);
        expect(
            (await join(token, { username: 'a b', password: 'abcdefgh' }))
                .status,
        ).toBe(400);
        expect(
            (await join(token, { username: 'Léa', password: 'court' })).status,
        ).toBe(400);
        // Déjà pris, quelle que soit la casse.
        const taken = await join(token, {
            username: 'ADMIN',
            password: 'abcdefgh',
        });
        expect(taken.status).toBe(409);
        // Le lien sert encore.
        expect(
            (await join(token, { username: 'Léa', password: 'abcdefgh' }))
                .status,
        ).toBe(200);
    });

    it('are listed and can be cancelled by the admin only', async () => {
        await invite('admin');
        const [invitation] = (await (
            await call('/invitations', { session: admin })
        ).json()) as { id: number; role: string; maxAge: number | null }[];
        // Pas d'âge maximal pour un admin.
        expect(invitation).toMatchObject({ role: 'admin', maxAge: null });

        const reader = sessionCookie(ctx.db, 'reader', 'reader');
        expect((await call('/invitations', { session: reader })).status).toBe(
            403,
        );
        expect(
            (
                await call('/invitations', {
                    method: 'POST',
                    session: reader,
                    body: { role: 'admin', maxAge: null },
                })
            ).status,
        ).toBe(403);

        await call(`/invitations/${invitation!.id}`, {
            method: 'DELETE',
            session: admin,
        });
        expect(
            await (await call('/invitations', { session: admin })).json(),
        ).toEqual([]);
    });
});

describe('login', () => {
    beforeEach(async () => {
        await join(await invite(), {
            username: 'Léa',
            password: 'un mot de passe',
        });
    });

    it('opens a session with the identifier, whatever its case', async () => {
        const response = await login(' LÉA ', 'un mot de passe');

        expect(response.status).toBe(200);
        const setCookie = response.headers.getSetCookie().join('\n');
        expect(setCookie).toMatch(/bento_session=[^;]+;.*HttpOnly/);
        expect(setCookie).toMatch(/SameSite=Lax/);
        expect(setCookie).not.toMatch(/Secure/);
        expect(await me(cookie(response, 'bento_session'))).toMatchObject({
            name: 'Léa',
        });
    });

    it('refuses a wrong password or an unknown identifier', async () => {
        const wrong = await login('léa', 'mauvais');
        expect(wrong.status).toBe(400);
        expect(await wrong.json()).toMatchObject({
            message: 'Identifiant ou mot de passe incorrect',
        });
        expect((await login('personne', 'abcdefgh')).status).toBe(400);
    });

    it('blocks an identifier after five failures', async () => {
        for (let i = 0; i < 5; i++) await login('léa', 'mauvais');

        const blocked = await login('léa', 'un mot de passe');
        expect(blocked.status).toBe(429);
        expect(await blocked.json()).toMatchObject({
            message: expect.stringMatching(/Trop d'essais/),
        });
    });

    it('marks cookies Secure when served over HTTPS', async () => {
        api = build('https://bento.example.com');

        const response = await login('léa', 'un mot de passe');

        expect(response.headers.getSetCookie().join('\n')).toMatch(
            /bento_session=.*Secure/,
        );
    });

    it('closes the session on logout', async () => {
        const session = cookie(
            await login('léa', 'un mot de passe'),
            'bento_session',
        );

        await call('/auth/logout', { method: 'POST', session });

        expect((await call('/me', { session })).status).toBe(401);
    });
});

describe('account links', () => {
    it('activates an account from Pocket ID and keeps it', async () => {
        const id = legacyAccount('Benjamin Corbeel');
        const { token } = (await (
            await call(`/users/${id}/link`, { method: 'POST', session: admin })
        ).json()) as { token: string };

        expect(await (await call(`/auth/links/${token}`)).json()).toEqual({
            kind: 'activate',
            username: 'Benjamin',
            email: 'Benjamin Corbeel@example.com',
            avatarSeed: null,
        });
        const response = await join(token, {
            username: 'Benjamin',
            password: 'un mot de passe',
            email: 'ben@example.com',
            avatarSeed: 'xyz',
        });

        expect(await me(cookie(response, 'bento_session'))).toMatchObject({
            id,
            name: 'Benjamin',
            email: 'ben@example.com',
            hasPassword: true,
        });
        expect((await login('benjamin', 'un mot de passe')).status).toBe(200);
    });

    it('sets a new password, and only that', async () => {
        await join(await invite(), {
            username: 'Léa',
            password: 'ancien mot',
        });
        const [lea] = ctx.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, 'léa'))
            .all();
        const first = (await (
            await call(`/users/${lea!.id}/link`, {
                method: 'POST',
                session: admin,
            })
        ).json()) as { token: string };
        const { token } = (await (
            await call(`/users/${lea!.id}/link`, {
                method: 'POST',
                session: admin,
            })
        ).json()) as { token: string };

        // Un nouveau lien remplace le précédent.
        expect((await call(`/auth/links/${first.token}`)).status).toBe(404);
        expect(await (await call(`/auth/links/${token}`)).json()).toMatchObject(
            { kind: 'reset', username: 'Léa' },
        );
        await join(token, { username: 'Pirate', password: 'nouveau mot' });

        expect((await login('léa', 'ancien mot')).status).toBe(400);
        expect((await login('léa', 'nouveau mot')).status).toBe(200);
    });
});

describe('my account', () => {
    let lea: string;

    beforeEach(async () => {
        lea = cookie(
            await join(await invite(), {
                username: 'Léa',
                password: 'un mot de passe',
            }),
            'bento_session',
        )!;
    });

    const patch = (body: Record<string, unknown>, session = lea) =>
        call('/me', { method: 'PATCH', session, body });

    it('changes the identifier, e-mail and avatar', async () => {
        expect(
            (await patch({ username: 'Lea.B', email: '', avatarSeed: 'q1' }))
                .status,
        ).toBe(200);
        expect(await me(lea)).toMatchObject({
            name: 'Lea.B',
            username: 'lea.b',
            email: null,
            avatarSeed: 'q1',
        });
        expect((await patch({ username: 'admin' })).status).toBe(409);
        expect((await patch({ email: 'pas un mail' })).status).toBe(400);
    });

    it('asks for the current password to change it', async () => {
        expect((await patch({ password: 'nouveau mot' })).status).toBe(400);
        expect(
            (
                await patch({
                    password: 'nouveau mot',
                    currentPassword: 'un mot de passe',
                })
            ).status,
        ).toBe(200);
        expect((await login('léa', 'nouveau mot')).status).toBe(200);
    });

    it('lets an account from Pocket ID choose its identifier and password', async () => {
        const id = legacyAccount('Benjamin Corbeel', 'admin');
        // Encore connecté depuis Pocket ID.
        const legacy = `bento_session=${createSession(ctx.db, id)}`;

        expect(await me(legacy)).toMatchObject({ hasPassword: false });
        expect((await patch({ password: 'abcdefgh' }, legacy)).status).toBe(
            400,
        );
        expect(
            (
                await patch(
                    { username: 'Benjamin', password: 'abcdefgh' },
                    legacy,
                )
            ).status,
        ).toBe(200);
        expect(await me(legacy)).toMatchObject({
            username: 'benjamin',
            hasPassword: true,
        });
    });
});

describe('accounts (admin)', () => {
    it('lists the accounts with their state', async () => {
        legacyAccount('Zoé');

        const list = (await (
            await call('/users', { session: admin })
        ).json()) as { name: string; hasPassword: boolean }[];

        expect(list.map((u) => [u.name, u.hasPassword])).toEqual([
            ['admin', false],
            ['Zoé', false],
        ]);
    });

    it('changes the role, but never the admin’s own', async () => {
        const id = legacyAccount('Zoé');
        const [self] = ctx.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, 'admin'))
            .all();

        const response = await call(`/users/${id}`, {
            method: 'PATCH',
            session: admin,
            body: { role: 'admin' },
        });
        expect(await response.json()).toMatchObject({ role: 'admin' });
        expect(
            (
                await call(`/users/${self!.id}`, {
                    method: 'PATCH',
                    session: admin,
                    body: { role: 'reader' },
                })
            ).status,
        ).toBe(403);
    });

    it('deletes an account, but not one’s own', async () => {
        const id = legacyAccount('Zoé');
        const [self] = ctx.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, 'admin'))
            .all();

        expect(
            (await call(`/users/${id}`, { method: 'DELETE', session: admin }))
                .status,
        ).toBe(200);
        expect(
            (
                await call(`/users/${self!.id}`, {
                    method: 'DELETE',
                    session: admin,
                })
            ).status,
        ).toBe(403);
        expect(
            ctx.db
                .select()
                .from(users)
                .all()
                .map((u) => u.name),
        ).toEqual(['admin']);
    });
});

describe('recovery link', () => {
    it('invites an admin when there is no account at all', async () => {
        ctx.db.delete(users).run();

        const token = recoveryLink(ctx.db)!;
        await join(token, { username: 'Chef', password: 'abcdefgh' });

        expect(ctx.db.select().from(users).all()).toMatchObject([
            { name: 'Chef', role: 'admin' },
        ]);
        expect(recoveryLink(ctx.db)).toBeUndefined();
    });

    it('activates the first admin from Pocket ID', async () => {
        ctx.db.delete(users).run();
        legacyAccount('Benjamin', 'admin');

        const token = recoveryLink(ctx.db)!;
        expect(await (await call(`/auth/links/${token}`)).json()).toMatchObject(
            { kind: 'activate' },
        );
    });

    it('gives a new password link for a named admin', async () => {
        await join(await invite('admin'), {
            username: 'Chef',
            password: 'abcdefgh',
        });

        expect(adminLink(ctx.db, 'personne')).toBeUndefined();
        const link = adminLink(ctx.db, 'CHEF')!;
        expect(link.name).toBe('Chef');
        expect(
            await (await call(`/auth/links/${link.token}`)).json(),
        ).toMatchObject({ kind: 'reset' });
    });
});

describe('avatars', () => {
    it('draws a Clay avatar, kept a year', async () => {
        const response = await call('/avatars/abc');

        expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
        expect(response.headers.get('Cache-Control')).toMatch(/immutable/);
        expect(await response.text()).toMatch(/^<svg/);
        expect((await call('/avatars/a%20b')).status).toBe(400);
    });
});

describe('passwords', () => {
    it('are hashed with a salt and checked', async () => {
        const first = await hashPassword('secret123');
        const second = await hashPassword('secret123');

        expect(first).toMatch(/^scrypt\$/);
        expect(first).not.toBe(second);
        expect(await verifyPassword('secret123', first)).toBe(true);
        expect(await verifyPassword('secret124', first)).toBe(false);
        expect(await verifyPassword('secret123', 'abimé')).toBe(false);
    });
});

describe('LoginLimiter', () => {
    it('forgets failures after fifteen minutes', () => {
        let now = 0;
        const limiter = new LoginLimiter(() => now);
        for (let i = 0; i < 5; i++) limiter.fail('léa');

        expect(() => limiter.check('léa')).toThrow(/15 minutes/);
        expect(() => limiter.check('bob')).not.toThrow();
        now = 15 * 60 * 1000 + 1;
        expect(() => limiter.check('léa')).not.toThrow();
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
