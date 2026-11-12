import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { series } from '../src/db/schema';
import { getSeries, listSeries } from '../src/library/catalog';
import { saveSourceRating, seriesRatingOf } from '../src/library/ratings';
import { setup, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
const ADMIN = { id: 0, role: 'admin' as const, maxAge: null };

beforeEach(async () => {
    ctx = await setup();
    await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));
    await ctx.scanner.scan(ctx.library.id);
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('readers ratings', () => {
    it('averages the sites, each weighted by its number of reviews', () => {
        const ratings = new Map([
            ['manga-news:Gantz', { value: 4.4, count: 100 }],
            ['bedetheque:500', { value: 3.4, count: 300 }],
        ]);
        expect(
            seriesRatingOf(
                [
                    { site: 'manga-news', id: 'Gantz' },
                    { site: 'bedetheque', id: '500' },
                    { site: 'wikipedia', id: '7' },
                ],
                ratings,
            ),
        ).toEqual({
            value: 3.7,
            count: 400,
            sources: [
                { site: 'manga-news', value: 4.4, count: 100 },
                { site: 'bedetheque', value: 3.4, count: 300 },
            ],
        });
        expect(seriesRatingOf([], ratings)).toBeNull();
    });

    it('follows the series linked to the sheets, kept when they are read', () => {
        const [gantz] = listSeries(ctx.db, ADMIN);
        expect(gantz).toMatchObject({ rating: null, ratingCount: 0 });

        ctx.db
            .update(series)
            .set({ sources: 'manga-news:Gantz bedetheque:500' })
            .where(eq(series.id, gantz!.id))
            .run();
        saveSourceRating(ctx.db, 'manga-news', 'Gantz', {
            value: 4.4,
            count: 96,
        });
        // Relue plus tard : la note est remplacée.
        saveSourceRating(ctx.db, 'manga-news', 'Gantz', {
            value: 4.5,
            count: 100,
        });

        expect(listSeries(ctx.db, ADMIN)[0]).toMatchObject({
            rating: 4.5,
            ratingCount: 100,
        });
        expect(getSeries(ctx.db, ADMIN, gantz!.id).rating).toEqual({
            value: 4.5,
            count: 100,
            sources: [{ site: 'manga-news', value: 4.5, count: 100 }],
        });
    });
});
