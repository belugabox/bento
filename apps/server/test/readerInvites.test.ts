import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { users } from '../src/db/schema';
import { SettingsStore } from '../src/settings';
import { authDeps, sessionCookie, setup, silent } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let settings: SettingsStore;
let admin: string;
let lou: string;

beforeEach(async () => {
    ctx = await setup();
    settings = new SettingsStore(ctx.db);
    api = createApi({
        db: ctx.db,
        logger: silent,
        version: '1.0.0',
        scanner: ctx.scanner,
        pages: ctx.pages,
        coversPath: ctx.coversPath,
        files: ctx.files,
        covers: ctx.covers,
        wikipedia: ctx.wikipedia,
        settings,
        auth: authDeps(),
    });
    admin = sessionCookie(ctx.db, 'admin', 'admin');
    lou = sessionCookie(ctx.db, 'reader', 'lou');
    // Lou : un lecteur limité à 12 ans.
    ctx.db
        .update(users)
        .set({ name: 'Lou', maxAge: 12 })
        .where(eq(users.username, 'lou'))
        .run();
});

afterEach(async () => {
    await ctx.cleanup();
});

const call = (
    path: string,
    {
        method = 'GET',
        session,
        body,
    }: { method?: string; session?: string; body?: unknown } = {},
) =>
    api.request(path, {
        method,
        headers: {
            Cookie: session ?? '',
            ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

const invite = (session: string, maxAge: number | null = null) =>
    call('/me/invitations', {
        method: 'POST',
        session,
        body: { maxAge },
    });

const tokenOf = async (response: Response) =>
    ((await response.json()) as { token: string }).token;

const join = (token: string, username: string) =>
    call(`/auth/links/${token}`, {
        method: 'POST',
        body: { username, password: 'un mot de passe' },
    });

const login = (username: string) =>
    call('/auth/login', {
        method: 'POST',
        body: { username, password: 'un mot de passe' },
    });

describe('invitations by readers', () => {
    it('are closed until the admin opens them', async () => {
        expect(
            await (await call('/me', { session: lou })).json(),
        ).toMatchObject({ canInvite: false });
        expect((await invite(lou)).status).toBe(403);

        settings.update({ readersCanInvite: true });
        expect(
            await (await call('/me', { session: lou })).json(),
        ).toMatchObject({ canInvite: true });
        // L'admin invite depuis Comptes.
        expect(
            await (await call('/me', { session: admin })).json(),
        ).toMatchObject({ canInvite: false });
        expect((await invite(admin)).status).toBe(403);
    });

    it('create an account that waits for the admin, never above the inviter', async () => {
        settings.update({ readersCanInvite: true });
        // Sans limite demandée : celle de Lou.
        const token = await tokenOf(await invite(lou, null));

        expect(await (await call(`/auth/links/${token}`)).json()).toMatchObject(
            { kind: 'invite', invitedBy: 'Lou' },
        );
        const joined = await join(token, 'Sam');
        expect(await joined.json()).toEqual({ kind: 'invite', pending: true });
        // Pas de session : le compte attend l'admin.
        expect(joined.headers.getSetCookie()).toEqual([]);
        const refused = await login('sam');
        expect(refused.status).toBe(400);
        expect(await refused.text()).toContain('validation');

        expect(
            await (await call('/users/pending', { session: admin })).json(),
        ).toEqual({ count: 1 });
        const accounts = (await (
            await call('/users', { session: admin })
        ).json()) as {
            id: number;
            name: string;
            maxAge: number | null;
            invitedBy: string | null;
            pendingSince: string | null;
        }[];
        const sam = accounts.find((a) => a.name === 'Sam')!;
        expect(sam).toMatchObject({ maxAge: 12, invitedBy: 'Lou' });
        expect(sam.pendingSince).not.toBeNull();
        expect(
            await (await call('/me/invitations', { session: lou })).json(),
        ).toMatchObject({ links: [], pending: [{ name: 'Sam' }] });

        // Un lecteur ne valide pas.
        expect(
            (
                await call(`/users/${sam.id}/approve`, {
                    method: 'POST',
                    session: lou,
                    body: { maxAge: 10 },
                })
            ).status,
        ).toBe(403);
        expect(
            (
                await call(`/users/${sam.id}/approve`, {
                    method: 'POST',
                    session: admin,
                    body: { maxAge: 10 },
                })
            ).status,
        ).toBe(200);
        expect((await login('sam')).status).toBe(200);
        expect(
            await (await call('/users/pending', { session: admin })).json(),
        ).toEqual({ count: 0 });
        expect(
            ctx.db
                .select({ maxAge: users.maxAge })
                .from(users)
                .where(eq(users.id, sam.id))
                .get(),
        ).toEqual({ maxAge: 10 });
    });

    it('lower a limit above the inviter’s', async () => {
        settings.update({ readersCanInvite: true });
        await invite(lou, 16);
        const [link] = (
            (await (
                await call('/me/invitations', { session: lou })
            ).json()) as {
                links: { maxAge: number | null }[];
            }
        ).links;
        expect(link!.maxAge).toBe(12);
        // L'admin les voit, avec qui les envoie.
        expect(
            await (await call('/invitations', { session: admin })).json(),
        ).toMatchObject([{ invitedBy: 'Lou', maxAge: 12 }]);
    });

    it('are limited to two at once, accounts to validate included', async () => {
        settings.update({ readersCanInvite: true });
        const first = await tokenOf(await invite(lou));
        const second = await invite(lou);
        expect(second.status).toBe(200);
        expect((await invite(lou)).status).toBe(403);

        // Utilisée : le compte en attente compte encore.
        await join(first, 'Sam');
        expect((await invite(lou)).status).toBe(403);

        // Annulée : une place se libère.
        const { id } = (await second.json()) as { id: number };
        expect(
            (
                await call(`/me/invitations/${id}`, {
                    method: 'DELETE',
                    session: lou,
                })
            ).status,
        ).toBe(200);
        expect((await invite(lou)).status).toBe(200);
    });

    it('leave with the reader who sent them', async () => {
        settings.update({ readersCanInvite: true });
        await invite(lou);
        const louId = ctx.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, 'lou'))
            .get()!.id;
        await call(`/users/${louId}`, { method: 'DELETE', session: admin });
        expect(
            await (await call('/invitations', { session: admin })).json(),
        ).toEqual([]);
    });
});
