import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getSeries, listSeries } from '../src/library/catalog';
import { listManagedSeries } from '../src/library/management';
import { answerProposal, searchesToDo } from '../src/library/sheetProposals';
import {
    REFRESH_INTERVAL_MS,
    SheetRefresher,
} from '../src/library/sheetRefresh';
import type { Bedetheque } from '../src/metadata/bedetheque';
import type { MangaNews } from '../src/metadata/mangaNews';
import { SettingsStore } from '../src/settings';
import { notFound } from '../src/tools/errors';
import { setup, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
const ADMIN = { id: 0, role: 'admin' as const, maxAge: null };

const sheet = (title: string, writer: string) => ({
    title,
    writer,
    penciller: writer,
    publisher: 'Casterman',
    summary: '',
    volumeCount: 14,
    year: 2015,
    rating: { value: 4.4, count: 50 },
});

/** Sites factices : Bedetheque écrit « & », Manga-news « et ». */
const fakeSites = () => {
    const calls: string[] = [];
    const mangaNews = {
        search: async (text: string) => {
            calls.push(`manga-news cherche « ${text} »`);
            return text === 'Gloutons et Dragons'
                ? [{ id: 'Gloutons-et-Dragons', title: 'Gloutons et Dragons' }]
                : [];
        },
        series: async (id: string) => {
            calls.push(`manga-news lit ${id}`);
            return sheet('Gloutons et Dragons', 'KUI Ryoko');
        },
    };
    const bedetheque = {
        search: async (text: string) => {
            calls.push(`bedetheque cherche « ${text} »`);
            return text === 'Gloutons & Dragons'
                ? [
                      { id: '61000', title: 'Gloutons & Dragons' },
                      // Un autre nom : pas retenu.
                      { id: '61001', title: 'Gloutons & Dragons - Artbook' },
                  ]
                : [];
        },
        series: async (id: string) => {
            calls.push(`bedetheque lit ${id}`);
            if (id !== '61000') throw notFound('introuvable');
            return sheet('Gloutons & Dragons', 'Ryoko Kui');
        },
    };
    return {
        calls,
        sites: {
            mangaNews: mangaNews as unknown as MangaNews,
            bedetheque: bedetheque as unknown as Bedetheque,
        },
    };
};

let clock: Date;

beforeEach(async () => {
    ctx = await setup();
    await writeCbz(ctx.file('Gloutons et Dragons/T01.cbz'), {
        comicInfo:
            '<Series>Gloutons et Dragons</Series><Number>1</Number><Writer>Ryoko Kui</Writer>',
    });
    await ctx.scanner.scan(ctx.library.id);
    clock = new Date(2026, 10, 13, 3, 0);
});

afterEach(async () => {
    await ctx.cleanup();
});

/** Tous les passages de la nuit, au rythme réglé, jusqu'à ce que tout soit fait. */
const runNight = async (refresher: SheetRefresher) => {
    for (let i = 0; i < 10; i++) {
        await refresher.tick();
        clock = new Date(clock.getTime() + REFRESH_INTERVAL_MS);
    }
};

describe('missing sheets searched at night', () => {
    it('finds them one request at a time, and proposes them to the admin', async () => {
        const settings = new SettingsStore(ctx.db);
        settings.update({ sheetRefresh: true });
        const { calls, sites } = fakeSites();
        const refresher = new SheetRefresher(
            ctx.db,
            sites,
            settings,
            undefined,
            () => clock,
        );
        expect(refresher.status()).toMatchObject({ toSearch: 2, proposed: 0 });

        await runNight(refresher);

        expect(calls).toEqual([
            'manga-news cherche « Gloutons et Dragons »',
            'bedetheque cherche « Gloutons et Dragons »',
            // Trouvée sur Manga-news : lue ; Bedetheque : l'autre écriture.
            'manga-news lit Gloutons-et-Dragons',
            'bedetheque cherche « Gloutons & Dragons »',
            'bedetheque lit 61000',
        ]);
        expect(refresher.status()).toMatchObject({ toSearch: 0, proposed: 2 });

        const [gloutons] = listManagedSeries(ctx.db);
        expect(gloutons!.proposals).toEqual([
            {
                site: 'bedetheque',
                id: '61000',
                title: 'Gloutons & Dragons',
                details: {
                    writer: 'Ryoko Kui',
                    penciller: 'Ryoko Kui',
                    publisher: 'Casterman',
                    volumeCount: 14,
                    year: 2015,
                    // « KUI Ryoko » ou « Ryoko Kui » : la même personne.
                    sameAuthor: true,
                },
            },
            expect.objectContaining({
                site: 'manga-news',
                id: 'Gloutons-et-Dragons',
            }),
        ]);
        // Rien n'est lié d'office.
        expect(getSeries(ctx.db, ADMIN, gloutons!.id).sources).toEqual([]);

        // L'admin lie Bedetheque (sa note, déjà relevée, suit) et refuse
        // Manga-news : ni l'une ni l'autre ne revient.
        answerProposal(ctx.db, gloutons!.id, 'bedetheque', '61000', true);
        answerProposal(
            ctx.db,
            gloutons!.id,
            'manga-news',
            'Gloutons-et-Dragons',
            false,
        );
        expect(getSeries(ctx.db, ADMIN, gloutons!.id).sources).toEqual([
            { site: 'bedetheque', id: '61000' },
        ]);
        expect(listSeries(ctx.db, ADMIN)[0]).toMatchObject({
            rating: 4.4,
            ratingCount: 50,
        });
        expect(listManagedSeries(ctx.db)[0]!.proposals).toEqual([]);
        expect(searchesToDo(ctx.db, clock.getTime(), [])).toEqual([]);
    });

    it('searches again after 90 days when nothing was found', async () => {
        const settings = new SettingsStore(ctx.db);
        settings.update({ sheetRefresh: true });
        const { calls, sites } = fakeSites();
        // Rien sur aucun site.
        (sites.mangaNews as unknown as { search: () => unknown }).search =
            async () => {
                calls.push('manga-news cherche');
                return [];
            };
        (sites.bedetheque as unknown as { search: () => unknown }).search =
            async () => {
                calls.push('bedetheque cherche');
                return [];
            };
        const refresher = new SheetRefresher(
            ctx.db,
            sites,
            settings,
            undefined,
            () => clock,
        );
        await runNight(refresher);
        // Les deux écritures sur chaque site.
        expect(calls).toHaveLength(4);
        expect(searchesToDo(ctx.db, clock.getTime(), [])).toEqual([]);
        expect(
            searchesToDo(ctx.db, clock.getTime() + 91 * 24 * 3600_000, []),
        ).toHaveLength(2);
    });

    it('searches Manga-news for the mangas only, Bedetheque for all', async () => {
        expect(
            searchesToDo(ctx.db, clock.getTime(), []).map((s) => s.site),
        ).toEqual(['manga-news', 'bedetheque']);
        // Site désactivé : pas cherché.
        expect(
            searchesToDo(ctx.db, clock.getTime(), ['manga-news']).map(
                (s) => s.site,
            ),
        ).toEqual(['bedetheque']);

        const comics = await setup('comics');
        await writeCbz(comics.file('Blacksad/T01.cbz'), {
            comicInfo: '<Series>Blacksad</Series><Number>1</Number>',
        });
        await comics.scanner.scan(comics.library.id);
        expect(
            searchesToDo(comics.db, clock.getTime(), []).map((s) => s.site),
        ).toEqual(['bedetheque']);
        await comics.cleanup();
    });
});
