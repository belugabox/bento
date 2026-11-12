import { Hono } from 'hono';
import { z } from 'zod';

import { type AuthEnv, requireAdmin } from '../auth/routes';
import type { Db } from '../db';
import type { AniList } from '../metadata/anilist';
import type { MangaNews } from '../metadata/mangaNews';
import type { SettingsStore } from '../settings';
import { notFound } from '../tools/errors';
import { idParam, imageCache } from '../tools/routeParams';
import { zValidator } from '../tools/validator';
import type { SeriesBanners } from './banners';
import { getSeries, seriesCoverOf } from './catalog';
import { articleFirst } from './sortName';

/** Bannière possible d'une série : son site, son image, le titre lu. */
type BannerChoice = {
    site: 'manga-news' | 'anilist';
    url: string;
    title: string;
};

/**
 * Bannière d'une série (grande illustration en tête de sa fiche), montée
 * sous `/series` : l'image, les bannières possibles, le choix (admin).
 */
export const createBannerRoutes = ({
    db,
    settings,
    mangaNews,
    anilist,
    banners,
}: {
    db: Db;
    settings: SettingsStore;
    mangaNews: MangaNews;
    anilist: AniList;
    banners: SeriesBanners;
}) =>
    new Hono<AuthEnv>()
        .get('/:id/banner', zValidator('param', idParam), async (c) => {
            const { id } = c.req.valid('param');
            // Série visible de la personne (âge), comme sa couverture.
            seriesCoverOf(db, c.var.user, id);
            const image = await banners.read(id);
            if (!image) throw notFound('Pas de bannière');
            return c.body(new Uint8Array(image), 200, {
                'Content-Type': 'image/webp',
                'Cache-Control': imageCache(c.req.query('v')),
            });
        })
        // Bannières possibles : celle de la fiche Manga-news liée, et celles
        // d'AniList (mangas), lues à la demande de l'admin.
        .get(
            '/:id/banners',
            requireAdmin,
            zValidator('param', idParam),
            async (c) => {
                const found = getSeries(
                    db,
                    c.var.user,
                    c.req.valid('param').id,
                );
                const disabled = settings.get().disabledSources;
                const linked = found.sources.find(
                    (link) => link.site === 'manga-news',
                );
                const results = await Promise.allSettled<BannerChoice[]>([
                    linked && !disabled.includes('manga-news')
                        ? mangaNews.series(linked.id).then((sheet) =>
                              sheet.bannerUrl
                                  ? [
                                        {
                                            site: 'manga-news' as const,
                                            url: sheet.bannerUrl,
                                            title: sheet.title,
                                        },
                                    ]
                                  : [],
                          )
                        : Promise.resolve([]),
                    found.library.type === 'manga'
                        ? anilist
                              .banners(articleFirst(found.name))
                              .then((list) =>
                                  list.map((banner) => ({
                                      site: 'anilist' as const,
                                      url: banner.bannerUrl,
                                      title: banner.title,
                                  })),
                              )
                        : Promise.resolve([]),
                ]);
                return c.json({
                    banners: results.flatMap((r) =>
                        r.status === 'fulfilled' ? r.value : [],
                    ),
                    errors: results.flatMap((r) =>
                        r.status === 'rejected'
                            ? [
                                  r.reason instanceof Error
                                      ? r.reason.message
                                      : String(r.reason),
                              ]
                            : [],
                    ),
                });
            },
        )
        .put(
            '/:id/banner',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('json', z.object({ url: z.string().url().max(500) })),
            async (c) =>
                c.json(
                    await banners.set(
                        c.req.valid('param').id,
                        c.req.valid('json').url,
                    ),
                ),
        )
        .delete(
            '/:id/banner',
            requireAdmin,
            zValidator('param', idParam),
            async (c) => c.json(await banners.remove(c.req.valid('param').id)),
        );
