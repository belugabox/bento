import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { series } from '../src/db/schema';
import { getSeries } from '../src/library/catalog';
import { listManagedSeries } from '../src/library/management';
import {
    REFRESH_INTERVAL_MS,
    SheetRefresher,
} from '../src/library/sheetRefresh';
import {
    SHEET_GONE,
    type WatchedSheet,
    sheetChanges,
    sheetSeen,
    snapshotOf,
} from '../src/library/sheets';
import type { Bedetheque } from '../src/metadata/bedetheque';
import type { MangaNews } from '../src/metadata/mangaNews';
import { SettingsStore } from '../src/settings';
import { notFound, refused } from '../src/tools/errors';
import { setup, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
const ADMIN = { id: 0, role: 'admin' as const, maxAge: null };

const sheet = (
    changes: Partial<
        WatchedSheet & { rating: { value: number; count: number } }
    > = {},
) => ({
    title: 'Gantz',
    ongoing: true,
    volumeCount: 12,
    writer: 'Hiroya Oku',
    penciller: 'Hiroya Oku',
    publisher: 'Delcourt',
    summary: 'Kei meurt.',
    rating: { value: 4.4, count: 100 },
    ...changes,
});

/** Sites factices : chaque lecture est notée, la réponse est choisie. */
const fakeSites = () => {
    const calls: string[] = [];
    const answers = new Map<string, () => ReturnType<typeof sheet>>();
    const site =
        (name: string) => async (id: string, options?: { retry?: boolean }) => {
            calls.push(
                `${name}:${id}${options?.retry === false ? '' : ' (retry)'}`,
            );
            const answer = answers.get(`${name}:${id}`);
            if (!answer) throw notFound('introuvable');
            return answer();
        };
    return {
        calls,
        answers,
        sites: {
            mangaNews: { series: site('manga-news') } as unknown as MangaNews,
            bedetheque: { series: site('bedetheque') } as unknown as Bedetheque,
        },
    };
};

// La lecture lancée par « Lancer maintenant » a fini.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let clock: Date;
const at = (hour: number, minutes = 0) => {
    clock = new Date(2026, 10, 12, hour, minutes);
};
const later = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
};

beforeEach(async () => {
    ctx = await setup();
    await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));
    await ctx.scanner.scan(ctx.library.id);
    ctx.db
        .update(series)
        .set({ sources: 'manga-news:Gantz wikipedia:7 bedetheque:500' })
        .run();
    at(3);
});

afterEach(async () => {
    await ctx.cleanup();
});

const refresherWith = (enabled = true) => {
    const settings = new SettingsStore(ctx.db);
    settings.update({ sheetRefresh: enabled });
    const fake = fakeSites();
    fake.answers.set('manga-news:Gantz', () => sheet());
    fake.answers.set('bedetheque:500', () =>
        sheet({ rating: { value: 3.4, count: 300 } }),
    );
    const refresher = new SheetRefresher(
        ctx.db,
        fake.sites,
        settings,
        undefined,
        () => clock,
    );
    return { refresher, settings, ...fake };
};

describe('sheet changes', () => {
    it('lists the fields that changed, with the volumes and the status', () => {
        const before = snapshotOf(sheet());
        expect(sheetChanges(before, before)).toEqual([]);
        expect(
            sheetChanges(
                before,
                snapshotOf(
                    sheet({
                        volumeCount: 13,
                        ongoing: false,
                        summary: '  Kei\n meurt. ',
                        publisher: 'Pika',
                    }),
                ),
            ),
        ).toEqual([
            'Statut : en cours → terminée',
            'Tomes : 12 → 13',
            'Éditeur',
        ]);
    });
});

describe('background sheet refresh', () => {
    it('reads one sheet every 10 minutes at night, alternating the sites, never retrying', async () => {
        const { refresher, calls } = refresherWith();
        expect(refresher.status()).toMatchObject({ linked: 2, due: 2 });

        await refresher.tick();
        expect(calls).toEqual(['manga-news:Gantz']);
        // Trop tôt pour la suivante.
        later(REFRESH_INTERVAL_MS - 60_000);
        await refresher.tick();
        expect(calls).toHaveLength(1);
        later(60_000);
        await refresher.tick();
        expect(calls).toEqual(['manga-news:Gantz', 'bedetheque:500']);
        // Toutes lues : rien avant un mois.
        later(REFRESH_INTERVAL_MS);
        await refresher.tick();
        expect(calls).toHaveLength(2);
        expect(refresher.status()).toMatchObject({ due: 0, lastError: null });

        // La note suit les deux sites.
        const [gantz] = listManagedSeries(ctx.db);
        expect(getSeries(ctx.db, ADMIN, gantz!.id).rating).toMatchObject({
            value: 3.7,
            count: 400,
        });
    });

    it('does nothing when disabled or during the day', async () => {
        const { refresher, settings, calls } = refresherWith(false);
        await refresher.tick();
        settings.update({ sheetRefresh: true });
        at(14);
        await refresher.tick();
        expect(calls).toEqual([]);

        // « Lancer maintenant » : même le jour, au même rythme.
        refresher.runNow();
        await settle();
        expect(calls).toEqual(['manga-news:Gantz']);
        expect(refresher.status().running).toBe(true);
        later(REFRESH_INTERVAL_MS);
        await refresher.tick();
        later(REFRESH_INTERVAL_MS);
        await refresher.tick();
        expect(calls).toHaveLength(2);
        expect(refresher.status().running).toBe(false);
    });

    it('flags what changed since the admin saw the sheet, without applying it', async () => {
        const { refresher, answers } = refresherWith();
        await refresher.tick();
        later(REFRESH_INTERVAL_MS);
        await refresher.tick();
        expect(listManagedSeries(ctx.db)[0]!.sheetChanges).toEqual([]);

        // Un mois plus tard : un tome de plus, la fiche Bedetheque disparue.
        answers.set('manga-news:Gantz', () => sheet({ volumeCount: 13 }));
        answers.delete('bedetheque:500');
        later(31 * 24 * 3600_000);
        await refresher.tick();
        later(REFRESH_INTERVAL_MS);
        await refresher.tick();
        const [gantz] = listManagedSeries(ctx.db);
        expect(gantz!.sheetChanges).toEqual(['Tomes : 12 → 13', SHEET_GONE]);

        // Vue par l'admin (« Revoir ») : plus rien à revoir.
        sheetSeen(ctx.db, 'manga-news', 'Gantz', sheet({ volumeCount: 13 }));
        expect(listManagedSeries(ctx.db)[0]!.sheetChanges).toEqual([
            SHEET_GONE,
        ]);
    });

    it('pauses for 24 hours at the first refusal', async () => {
        const { refresher, answers, calls } = refresherWith();
        answers.set('manga-news:Gantz', () => {
            throw refused('Manga-news refuse la requête');
        });
        await refresher.tick();
        expect(refresher.status()).toMatchObject({
            lastError: 'Manga-news refuse la requête',
            due: 2,
        });
        expect(refresher.status().pausedUntil).not.toBeNull();

        // Ni la suite de la nuit, ni « Lancer maintenant ».
        later(REFRESH_INTERVAL_MS);
        await refresher.tick();
        refresher.runNow();
        await settle();
        expect(calls).toEqual(['manga-news:Gantz']);

        // La nuit suivante, ça reprend.
        later(24 * 3600_000);
        await refresher.tick();
        expect(calls).toHaveLength(2);
    });

    it('follows the pace chosen by the admin', async () => {
        const { refresher, settings, calls } = refresherWith();
        settings.update({ sheetRefreshMinutes: 30 });
        expect(refresher.status().intervalMinutes).toBe(30);
        await refresher.tick();
        later(REFRESH_INTERVAL_MS * 2);
        await refresher.tick();
        expect(calls).toHaveLength(1);
        later(REFRESH_INTERVAL_MS);
        await refresher.tick();
        expect(calls).toHaveLength(2);
        expect(
            settings.update.bind(null, { sheetRefreshMinutes: 1 }),
        ).toThrow();
    });

    it('skips the disabled sites', async () => {
        const { refresher, settings, calls } = refresherWith();
        settings.update({ disabledSources: ['manga-news'] });
        expect(refresher.status()).toMatchObject({ linked: 1, due: 1 });
        await refresher.tick();
        expect(calls).toEqual(['bedetheque:500']);
    });
});
