import { eq } from 'drizzle-orm';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import type { PageReader } from '../archive/archive';
import type { Db } from '../db';
import { series } from '../db/schema';
import { badGateway, badRequest, notFound } from '../tools/errors';
import { getVolume } from './catalog';
import { coverFile } from './scanner';

const COVER_WIDTH = 400;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// Seules les images de Wikimedia sont téléchargées (pas d'adresse arbitraire).
const ALLOWED_IMAGE_HOSTS = ['upload.wikimedia.org'];
const USER_AGENT = 'bento/1.0 (https://github.com/belugabox/bento)';
const ADMIN = { id: 0, role: 'admin' as const, maxAge: null };

export type CoverSource =
    | { type: 'volume'; volumeId: number; page?: number }
    | { type: 'url'; url: string }
    | { type: 'default' };

export const seriesCoverFile = (coversPath: string, seriesId: number) =>
    path.join(coversPath, `series-${seriesId}.webp`);

const toCover = (image: Buffer, destination: string) =>
    sharp(image)
        .resize({ width: COVER_WIDTH, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(destination);

/** Couverture choisie pour une série (tome, page ou image Wikimedia). */
export class SeriesCovers {
    constructor(
        private readonly db: Db,
        private readonly pages: PageReader,
        private readonly coversPath: string,
        private readonly fetchFn: typeof fetch = fetch,
    ) {}

    private download = async (url: string) => {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw badRequest('Adresse d’image invalide');
        }
        if (
            parsed.protocol !== 'https:' ||
            !ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)
        ) {
            throw badRequest('Seules les images de Wikimedia sont acceptées');
        }
        const response = await this.fetchFn(parsed, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(15_000),
        }).catch(() => undefined);
        if (!response?.ok) throw badGateway('Image introuvable sur Wikimedia');
        if (!response.headers.get('content-type')?.startsWith('image/')) {
            throw badGateway('L’adresse ne renvoie pas une image');
        }
        const image = Buffer.from(await response.arrayBuffer());
        if (image.length > MAX_IMAGE_BYTES) {
            throw badRequest('Image trop lourde');
        }
        return image;
    };

    set = async (seriesId: number, source: CoverSource) => {
        const row = this.db
            .select({ id: series.id })
            .from(series)
            .where(eq(series.id, seriesId))
            .get();
        if (!row) throw notFound('Série introuvable');
        const destination = seriesCoverFile(this.coversPath, seriesId);

        if (source.type === 'default') {
            await rm(destination, { force: true });
            this.db
                .update(series)
                .set({ coverUpdatedAt: null })
                .where(eq(series.id, seriesId))
                .run();
            return { coverUpdatedAt: null };
        }

        await mkdir(this.coversPath, { recursive: true });
        if (source.type === 'url') {
            await toCover(await this.download(source.url), destination).catch(
                () => {
                    throw badRequest('Image illisible');
                },
            );
        } else {
            const volume = getVolume(this.db, ADMIN, source.volumeId);
            if (volume.seriesId !== seriesId) {
                throw badRequest('Ce tome n’appartient pas à la série');
            }
            if (source.page === undefined) {
                await copyFile(coverFile(this.coversPath, volume.id), destination);
            } else {
                const { data } = await this.pages.page(volume.fullPath, source.page);
                await toCover(data, destination);
            }
        }
        const coverUpdatedAt = new Date();
        this.db
            .update(series)
            .set({ coverUpdatedAt })
            .where(eq(series.id, seriesId))
            .run();
        return { coverUpdatedAt };
    };
}
