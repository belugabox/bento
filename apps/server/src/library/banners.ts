import { eq } from 'drizzle-orm';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { readImage } from '../archive/image';
import type { Db } from '../db';
import { series } from '../db/schema';
import { badRequest, notFound } from '../tools/errors';
import { downloadImage } from './covers';

// Bannières : celles de Manga-news et d'AniList (son serveur d'images).
export const BANNER_HOSTS = ['www.manga-news.com', 's4.anilist.co'];
// Assez large pour un écran d'ordinateur, sans peser lourd.
const BANNER_WIDTH = 1600;
const BANNER_QUALITY = 80;

export const bannerFile = (coversPath: string, seriesId: number) =>
    path.join(coversPath, 'banners', `series-${seriesId}.webp`);

/**
 * Bannière d'une série (grande illustration en tête de sa fiche), choisie
 * par l'admin parmi celles des fiches en ligne ; gardée comme les
 * couvertures.
 */
export class SeriesBanners {
    constructor(
        private readonly db: Db,
        private readonly coversPath: string,
        private readonly fetchFn: typeof fetch = fetch,
    ) {}

    private seriesExists = (seriesId: number) => {
        const row = this.db
            .select({ id: series.id })
            .from(series)
            .where(eq(series.id, seriesId))
            .get();
        if (!row) throw notFound('Série introuvable');
    };

    private saveDate = (seriesId: number, date: Date | null) => {
        this.db
            .update(series)
            .set({ bannerUpdatedAt: date })
            .where(eq(series.id, seriesId))
            .run();
        return { bannerUpdatedAt: date };
    };

    /** Bannière téléchargée, réduite, et gardée pour la série. */
    set = async (seriesId: number, url: string) => {
        this.seriesExists(seriesId);
        const image = await downloadImage(this.fetchFn, url, BANNER_HOSTS);
        const destination = bannerFile(this.coversPath, seriesId);
        await mkdir(path.dirname(destination), { recursive: true });
        await readImage(image)
            .resize({ width: BANNER_WIDTH, withoutEnlargement: true })
            .webp({ quality: BANNER_QUALITY })
            .toFile(destination)
            .catch(() => {
                throw badRequest('Image illisible');
            });
        return this.saveDate(seriesId, new Date());
    };

    /** Plus de bannière : la fiche reprend la couleur de la couverture. */
    remove = async (seriesId: number) => {
        this.seriesExists(seriesId);
        await rm(bannerFile(this.coversPath, seriesId), { force: true });
        return this.saveDate(seriesId, null);
    };

    /** Image de la bannière, ou undefined sans bannière. */
    read = (seriesId: number) =>
        readFile(bannerFile(this.coversPath, seriesId)).catch(() => undefined);
}
