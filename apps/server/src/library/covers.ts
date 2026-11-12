import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { PageReader } from '../archive/archive';
import { COVER_QUALITY, COVER_SIZE, readImage } from '../archive/image';
import type { Db } from '../db';
import { libraries, series } from '../db/schema';
import { badGateway, badRequest, notFound } from '../tools/errors';
import { getVolume } from './catalog';
import { checkDraftFolder, saveDraftSettings } from './draftSettings';
import { resolveInLibrary } from './paths';
import { coverFile } from './scanner';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// Seules les images de Wikimedia et de Manga-news sont téléchargées (pas
// d'adresse arbitraire).
const ALLOWED_IMAGE_HOSTS = ['upload.wikimedia.org', 'www.manga-news.com'];
const USER_AGENT = 'bento/1.0 (https://github.com/belugabox/bento)';
const ADMIN = { id: 0, role: 'admin' as const, maxAge: null };

/**
 * Image d'un des sites acceptés (pas d'adresse arbitraire, pas de
 * redirection), 10 Mo au plus.
 */
export const downloadImage = async (
    fetchFn: typeof fetch,
    url: string,
    hosts: readonly string[],
) => {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw badRequest('Adresse d’image invalide');
    }
    if (parsed.protocol !== 'https:' || !hosts.includes(parsed.hostname)) {
        throw badRequest(
            `Image refusée : seuls ${hosts.join(', ')} sont acceptés`,
        );
    }
    const response = await fetchFn(parsed, {
        headers: { 'User-Agent': USER_AGENT },
        // Une redirection pourrait mener hors des sites acceptés.
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined);
    if (!response?.ok) {
        throw badGateway(`Image introuvable sur ${parsed.hostname}`);
    }
    if (!response.headers.get('content-type')?.startsWith('image/')) {
        throw badGateway('L’adresse ne renvoie pas une image');
    }
    const image = Buffer.from(await response.arrayBuffer());
    if (image.length > MAX_IMAGE_BYTES) {
        throw badRequest('Image trop lourde');
    }
    return image;
};

/** Partie de l'image gardée quand elle est recadrée en 2:3. */
export type CoverPosition = 'top' | 'center' | 'bottom';

export type CoverSource =
    // Tome de la série : sa couverture, ou une de ses pages.
    | { type: 'volume'; volumeId: number; page?: number }
    // Fichier du dossier de brouillons (sa première page par défaut).
    | { type: 'file'; path: string; page?: number }
    | { type: 'url'; url: string }
    // Image envoyée depuis l'appareil, en base64.
    | { type: 'image'; data: string }
    | { type: 'default' };

export const seriesCoverFile = (coversPath: string, seriesId: number) =>
    path.join(coversPath, `series-${seriesId}.webp`);

/** Couverture choisie pour la future série d'un dossier de brouillons. */
export const draftCoverFile = (
    coversPath: string,
    libraryId: number,
    folder: string,
) =>
    path.join(
        coversPath,
        'drafts',
        `${libraryId}-${createHash('sha1').update(folder).digest('hex').slice(0, 16)}.webp`,
    );

const toCover = (image: Buffer, destination: string, position: CoverPosition) =>
    readImage(image)
        .resize({
            ...COVER_SIZE,
            position,
        })
        .webp({ quality: COVER_QUALITY })
        .toFile(destination)
        .catch(() => {
            throw badRequest('Image illisible');
        });

/** Couverture choisie pour une série, ou pour un dossier de brouillons. */
export class SeriesCovers {
    constructor(
        private readonly db: Db,
        private readonly pages: PageReader,
        private readonly coversPath: string,
        private readonly fetchFn: typeof fetch = fetch,
    ) {}

    private download = (url: string) =>
        downloadImage(this.fetchFn, url, ALLOWED_IMAGE_HOSTS);

    private decode = (data: string) => {
        const image = Buffer.from(data, 'base64');
        if (image.length === 0) throw badRequest('Image vide');
        if (image.length > MAX_IMAGE_BYTES) {
            throw badRequest('Image trop lourde');
        }
        return image;
    };

    /** Image d'une page (ou d'une source extérieure) recadrée en couverture. */
    private render = async (
        image: Buffer,
        destination: string,
        position: CoverPosition,
    ) => {
        await mkdir(path.dirname(destination), { recursive: true });
        await toCover(image, destination, position);
    };

    set = async (
        seriesId: number,
        source: CoverSource,
        position: CoverPosition = 'top',
    ) => {
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

        if (source.type === 'volume') {
            const volume = getVolume(this.db, ADMIN, source.volumeId);
            if (volume.seriesId !== seriesId) {
                throw badRequest('Ce tome n’appartient pas à la série');
            }
            if (source.page === undefined && position === 'top') {
                await mkdir(this.coversPath, { recursive: true });
                await copyFile(
                    coverFile(this.coversPath, volume.id),
                    destination,
                );
            } else {
                const { data } = await this.pages.page(
                    volume.fullPath,
                    source.page ?? 0,
                );
                await this.render(data, destination, position);
            }
        } else if (source.type === 'file') {
            throw badRequest('Choisis un tome de la série');
        } else {
            await this.render(
                await this.imageOf(source),
                destination,
                position,
            );
        }
        const coverUpdatedAt = new Date();
        this.db
            .update(series)
            .set({ coverUpdatedAt })
            .where(eq(series.id, seriesId))
            .run();
        return { coverUpdatedAt };
    };

    /** Couverture de la future série d'un dossier de brouillons. */
    setDraft = async (
        libraryId: number,
        folder: string,
        source: CoverSource,
        position: CoverPosition = 'top',
    ) => {
        const library = this.db
            .select({ path: libraries.path })
            .from(libraries)
            .where(eq(libraries.id, libraryId))
            .get();
        if (!library) throw notFound('Bibliothèque introuvable');
        checkDraftFolder(folder);
        const destination = draftCoverFile(this.coversPath, libraryId, folder);

        if (source.type === 'default') {
            await rm(destination, { force: true });
            saveDraftSettings(this.db, libraryId, folder, {
                coverUpdatedAt: null,
            });
            return { coverUpdatedAt: null };
        }
        if (source.type === 'volume') {
            throw badRequest('Choisis un fichier du brouillon');
        }
        if (source.type === 'file') {
            if (path.posix.dirname(source.path) !== folder) {
                throw badRequest('Ce fichier n’est pas dans le dossier');
            }
            const { data } = await this.pages.page(
                resolveInLibrary(library.path, source.path),
                source.page ?? 0,
            );
            await this.render(data, destination, position);
        } else {
            await this.render(
                await this.imageOf(source),
                destination,
                position,
            );
        }
        return saveDraftSettings(this.db, libraryId, folder, {
            coverUpdatedAt: new Date(),
        });
    };

    private imageOf = (
        source: Extract<CoverSource, { type: 'url' | 'image' }>,
    ) =>
        source.type === 'url'
            ? this.download(source.url)
            : Promise.resolve(this.decode(source.data));
}
