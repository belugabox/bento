import { eq } from 'drizzle-orm';
import { writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { users } from '../src/db/schema';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;

const call = async (
    path: string,
    cookie: string,
    init: { method?: string; json?: unknown } = {},
) => {
    const response = await api.request(path, {
        method: init.method ?? 'GET',
        headers: {
            Cookie: cookie,
            ...(init.json !== undefined && {
                'Content-Type': 'application/json',
            }),
        },
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
    const text = await response.text();
    return {
        status: response.status,
        body:
            text.startsWith('{') || text.startsWith('[')
                ? JSON.parse(text)
                : text,
        cookie: response.headers
            .getSetCookie()
            .find((c) => c.startsWith('bento_preview='))
            ?.split(';')[0],
    };
};

const names = async (cookie: string) =>
    (await call('/series', cookie)).body.map((s: { name: string }) => s.name);

beforeEach(async () => {
    ctx = await setup();
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
        auth: authDeps(),
    });
    admin = sessionCookie(ctx.db, 'admin');
    await writeCbz(ctx.file('Kids/Kids T01.cbz'), {
        comicInfo: '<AgeRating>Everyone</AgeRating>',
    });
    await writeCbz(ctx.file('Teen/Teen T01.cbz'), {
        comicInfo: '<AgeRating>Teen</AgeRating>',
    });
    await ctx.scanner.scan(ctx.library.id);
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('reader preview for admins', () => {
    it('shows the catalogue as a reader of the chosen age', async () => {
        const set = await call('/preview', admin, {
            method: 'PUT',
            json: { maxAge: 10 },
        });
        expect(set.body).toEqual({ preview: { maxAge: 10 } });
        const previewing = `${admin}; ${set.cookie}`;

        expect((await call('/me', previewing)).body).toMatchObject({
            role: 'reader',
            maxAge: 10,
            preview: { maxAge: 10 },
        });
        expect(await names(previewing)).toEqual(['Kids']);
        // Les écrans d'admin ne répondent plus.
        expect((await call('/users', previewing)).status).toBe(403);
    });

    it('can change the age, show everything, and come back', async () => {
        const all = await call('/preview', admin, {
            method: 'PUT',
            json: { maxAge: null },
        });
        const previewing = `${admin}; ${all.cookie}`;
        expect(await names(previewing)).toEqual(['Kids', 'Teen']);
        expect((await call('/me', previewing)).body.role).toBe('reader');

        // Encore possible depuis la vue lecteur.
        const changed = await call('/preview', previewing, {
            method: 'PUT',
            json: { maxAge: 0 },
        });
        expect(changed.status).toBe(200);

        const back = await call('/preview', previewing, { method: 'DELETE' });
        expect(back.cookie).toBe('bento_preview=');
        expect((await call('/me', admin)).body).toMatchObject({
            role: 'admin',
            preview: null,
        });
    });

    it('is for admins only, with a valid age', async () => {
        const reader = sessionCookie(ctx.db, 'reader');
        expect(
            (
                await call('/preview', reader, {
                    method: 'PUT',
                    json: { maxAge: 10 },
                })
            ).status,
        ).toBe(403);
        // Un cookie forgé par un lecteur est ignoré.
        expect(
            (await call('/me', `${reader}; bento_preview=all`)).body,
        ).toMatchObject({ role: 'reader', preview: null });
        expect(
            (
                await call('/preview', admin, {
                    method: 'PUT',
                    json: { maxAge: 19 },
                })
            ).status,
        ).toBe(400);
    });
});

describe('GET /drafts/pending', () => {
    it('counts the draft folders and loose draft volumes', async () => {
        await writeCbz(ctx.file('_draft/Gantz/Gantz T01.cbz'));
        await writeCbz(ctx.file('_draft/Gantz/Gantz T02.cbz'));
        await writeCbz(ctx.file('_draft/Spirale/Sub/Spirale T01.cbz'));
        await writeCbz(ctx.file('_draft/Oneshot.cbz'));
        await writeFile(ctx.file('_draft/notes.txt'), 'x');

        expect((await call('/drafts/pending', admin)).body).toEqual({
            series: 3,
        });
        const reader = sessionCookie(ctx.db, 'reader');
        expect((await call('/drafts/pending', reader)).status).toBe(403);
    });
});

describe('simulating an account', () => {
    let lea: string;
    let leaId: number;
    let previewing: string;

    beforeEach(async () => {
        lea = sessionCookie(ctx.db, 'reader', 'lea');
        leaId = ctx.db
            .select()
            .from(users)
            .all()
            .find((u) => u.username === 'lea')!.id;
        ctx.db
            .update(users)
            .set({ name: 'Léa', maxAge: 10 })
            .where(eq(users.id, leaId))
            .run();
        const set = await call('/preview', admin, {
            method: 'PUT',
            json: { userId: leaId },
        });
        expect(set.body).toEqual({
            preview: { maxAge: 10, user: { id: leaId, name: 'Léa' } },
        });
        previewing = `${admin}; ${set.cookie}`;
    });

    it('lists the reader accounts to the admin only', async () => {
        expect((await call('/preview/accounts', admin)).body).toEqual([
            { id: leaId, name: 'Léa', avatarSeed: null, maxAge: 10 },
        ]);
        expect((await call('/preview/accounts', previewing)).status).toBe(200);
        expect((await call('/preview/accounts', lea)).status).toBe(403);
    });

    it('sees the app as that account', async () => {
        const series = (await call('/series', lea)).body;
        const kids = series.find((s: { name: string }) => s.name === 'Kids');
        const volume = (await call(`/series/${kids.id}`, lea)).body.volumes[0];
        await call(`/volumes/${volume.id}/progress`, lea, {
            method: 'PUT',
            json: { page: 0 },
        });

        expect((await call('/me', previewing)).body).toMatchObject({
            id: leaId,
            name: 'Léa',
            role: 'reader',
            preview: { user: { id: leaId, name: 'Léa' } },
        });
        expect(await names(previewing)).toEqual(['Kids']);
        expect(
            (await call(`/volumes/${volume.id}`, previewing)).body.progress,
        ).toMatchObject({ page: 0 });
    });

    it('changes nothing, but can leave the view', async () => {
        const series = (await call('/series', previewing)).body;
        const refused = await call(
            `/series/${series[0].id}/lists`,
            previewing,
            {
                method: 'PUT',
                json: { toRead: true },
            },
        );
        expect(refused.status).toBe(403);
        expect(refused.body.message).toMatch(/Vue de Léa : lecture seule/);

        // Autre compte ou autre âge, puis retour à la vue admin.
        expect(
            (
                await call('/preview', previewing, {
                    method: 'PUT',
                    json: { maxAge: 12 },
                })
            ).status,
        ).toBe(200);
        const back = await call('/preview', previewing, { method: 'DELETE' });
        expect(back.status).toBe(200);
    });

    it('never simulates an admin or oneself', async () => {
        const adminId = ctx.db
            .select()
            .from(users)
            .all()
            .find((u) => u.role === 'admin')!.id;
        for (const userId of [adminId, 9999]) {
            expect(
                (
                    await call('/preview', admin, {
                        method: 'PUT',
                        json: { userId },
                    })
                ).status,
            ).toBe(400);
        }
        // Simulation refusée à un lecteur.
        expect(
            (
                await call('/preview', lea, {
                    method: 'PUT',
                    json: { userId: leaId },
                })
            ).status,
        ).toBe(403);
    });
});
