import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { getSeries, listSeries } from '../src/library/catalog';
import { listManagedSeries } from '../src/library/management';
import { saveSourceRating } from '../src/library/ratings';
import { Bedetheque } from '../src/metadata/bedetheque';
import {
    authDeps,
    formatDrafts,
    sessionCookie,
    setup,
    silent,
    writeCbz,
} from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
const ADMIN = { id: 0, role: 'admin' as const, maxAge: null };

// Fiche Bedetheque enregistrée : un album noté 4.3/5 sur 127 votes.
const page = readFileSync(
    path.join(__dirname, 'fixtures', 'bedetheque', 'asterios-polyp.html'),
    'utf-8',
);

const comicInfo = (number: string) =>
    `<Series>Gantz</Series><Number>${number}</Number>`;

/** Gantz, liée à sa fiche Manga-news (3,9 sur 39 avis). */
beforeEach(async () => {
    ctx = await setup();
    await writeCbz(ctx.file('Gantz/Gantz T01.cbz'), {
        comicInfo: comicInfo('1'),
    });
    await ctx.scanner.scan(ctx.library.id);
    const [gantz] = listSeries(ctx.db, ADMIN);
    const api = createApiFor();
    await api.request(`/series/${gantz!.id}/classification`, {
        method: 'PUT',
        headers: {
            Cookie: sessionCookie(ctx.db, 'admin'),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            sources: [{ site: 'manga-news', id: 'Gantz' }],
        }),
    });
    saveSourceRating(ctx.db, 'manga-news', 'Gantz', { value: 3.9, count: 39 });
});

afterEach(async () => {
    await ctx.cleanup();
});

const createApiFor = () =>
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
        bedetheque: new Bedetheque(
            (async () => new Response(page)) as unknown as typeof fetch,
        ),
        auth: authDeps(),
    });

// (3,9 × 39 + 4,3 × 127) / 166 = 4,2.
const BOTH = {
    value: 4.2,
    count: 166,
    sources: [
        { site: 'manga-news', value: 3.9, count: 39 },
        { site: 'bedetheque', value: 4.3, count: 127 },
    ],
};

describe('adding a Bedetheque sheet to a series', () => {
    it('averages its rating with the Manga-news one, once the sheet is saved', async () => {
        const api = createApiFor();
        const admin = { Cookie: sessionCookie(ctx.db, 'admin') };
        const [gantz] = listSeries(ctx.db, ADMIN);
        expect(getSeries(ctx.db, ADMIN, gantz!.id).rating).toMatchObject({
            value: 3.9,
            count: 39,
        });
        expect(listManagedSeries(ctx.db)[0]!.sheetSites).toEqual([
            'manga-news',
        ]);

        // « Remplir » : la fiche lue (note gardée), puis enregistrée avec
        // celle de Manga-news.
        const sheet = await api.request(
            '/metadata/bedetheque/series?id=25654',
            { headers: admin },
        );
        expect((await sheet.json()).rating).toEqual({ value: 4.3, count: 127 });
        // Lue mais pas encore enregistrée : la série n'a pas changé.
        expect(getSeries(ctx.db, ADMIN, gantz!.id).rating?.count).toBe(39);

        const saved = await api.request(`/series/${gantz!.id}/classification`, {
            method: 'PUT',
            headers: { ...admin, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sources: [
                    { site: 'manga-news', id: 'Gantz' },
                    { site: 'bedetheque', id: '25654' },
                ],
            }),
        });
        expect(saved.status).toBe(200);

        expect(getSeries(ctx.db, ADMIN, gantz!.id).rating).toEqual(BOTH);
        expect(listSeries(ctx.db, ADMIN)[0]).toMatchObject({
            rating: 4.2,
            ratingCount: 166,
        });
        expect(listManagedSeries(ctx.db)[0]).toMatchObject({
            rating: 4.2,
            sheetSites: ['manga-news', 'bedetheque'],
        });
    });

    it('keeps the Manga-news sheet when a draft filled from Bedetheque joins the series', async () => {
        await writeCbz(ctx.file('_draft/Gantz/Gantz T02.cbz'), {
            comicInfo: comicInfo('2'),
        });
        ctx.files.setDraftSettings(ctx.library.id, '_draft/Gantz', {
            sources: 'bedetheque:25654',
        });
        saveSourceRating(ctx.db, 'bedetheque', '25654', {
            value: 4.3,
            count: 127,
        });
        await formatDrafts(ctx);
        await ctx.files.publish(ctx.library.id, ['_draft/Gantz/Gantz T02.cbz']);

        const [gantz] = listSeries(ctx.db, ADMIN);
        const details = getSeries(ctx.db, ADMIN, gantz!.id);
        expect(details.volumes).toHaveLength(2);
        expect(details.sources).toEqual([
            { site: 'manga-news', id: 'Gantz' },
            { site: 'bedetheque', id: '25654' },
        ]);
        expect(details.rating).toEqual(BOTH);
    });
});
