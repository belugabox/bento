import { randomBytes } from 'node:crypto';
import {
    mkdir,
    readFile,
    readdir,
    rename,
    rm,
    stat,
    unlink,
    writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { readImage } from '../archive/image';
import type { PageWidth } from './pageWidths';

// Place prise au plus par les pages réduites ; au-delà, les plus anciennes
// sont effacées (jusqu'à 80 % de la limite).
const MAX_BYTES = 2 * 1024 ** 3;
const PRUNE_TO = 0.8;
// Qualité WebP des pages réduites : nette en lecture, trois fois plus légère.
const QUALITY = 80;

type Page = { data: Buffer; type: string };

/**
 * Pages réduites à la largeur d'un écran (WebP), calculées à la première
 * demande puis gardées sur disque : `dir/<tome>/<version>-<page>-<largeur>.webp`.
 * Une nouvelle version d'un tome (compression…) efface les anciennes.
 */
export class ResizedPages {
    // Même page demandée deux fois en même temps : calculée une fois.
    private inFlight = new Map<string, Promise<Page>>();
    // Place prise, comptée au premier besoin.
    private total: number | undefined;
    // Tomes dont les anciennes versions ont déjà été effacées.
    private cleaned = new Set<string>();

    constructor(
        private readonly dir: string,
        private readonly maxBytes = MAX_BYTES,
    ) {}

    private fileOf = (
        volumeId: number,
        version: number,
        index: number,
        width: PageWidth,
    ) =>
        path.join(
            this.dir,
            String(volumeId),
            `${version}-${index}-${width}.webp`,
        );

    /**
     * Page réduite à `width` (jamais agrandie) ; `original` lit la page
     * d'origine. Un GIF (animé) est servi tel quel.
     */
    get = async (
        volumeId: number,
        version: number,
        index: number,
        width: PageWidth,
        original: () => Promise<Page>,
    ): Promise<Page> => {
        const file = this.fileOf(volumeId, version, index, width);
        const cached = await readFile(file).catch(() => undefined);
        if (cached) return { data: cached, type: 'image/webp' };

        const running = this.inFlight.get(file);
        if (running) return running;
        const task = this.create(volumeId, version, file, width, original);
        this.inFlight.set(file, task);
        try {
            return await task;
        } finally {
            this.inFlight.delete(file);
        }
    };

    private create = async (
        volumeId: number,
        version: number,
        file: string,
        width: PageWidth,
        original: () => Promise<Page>,
    ): Promise<Page> => {
        const page = await original();
        if (page.type === 'image/gif') return page;
        const data = await readImage(page.data)
            .rotate()
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: QUALITY })
            .toBuffer()
            .catch(() => undefined);
        // Image illisible : la page d'origine, sans rien garder.
        if (!data) return page;

        await this.forgetOldVersions(volumeId, version);
        await mkdir(path.dirname(file), { recursive: true });
        // Fichier temporaire puis renommage : jamais de page à moitié écrite.
        const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
        await writeFile(tmp, data);
        await rename(tmp, file).catch(() => unlink(tmp).catch(() => {}));
        await this.added(data.length);
        return { data, type: 'image/webp' };
    };

    /** Pages d'une version précédente du tome : inutiles. */
    private forgetOldVersions = async (volumeId: number, version: number) => {
        const key = `${volumeId}-${version}`;
        if (this.cleaned.has(key)) return;
        this.cleaned.add(key);
        const folder = path.join(this.dir, String(volumeId));
        const names = await readdir(folder).catch(() => [] as string[]);
        for (const name of names) {
            if (!name.startsWith(`${version}-`)) {
                const size = (
                    await stat(path.join(folder, name)).catch(() => undefined)
                )?.size;
                await rm(path.join(folder, name), { force: true });
                if (size && this.total !== undefined) this.total -= size;
            }
        }
    };

    /** Toutes les pages gardées, avec leur taille et leur date. */
    private files = async () => {
        const found: { file: string; size: number; time: number }[] = [];
        const folders = await readdir(this.dir).catch(() => [] as string[]);
        for (const folder of folders) {
            const names = await readdir(path.join(this.dir, folder)).catch(
                () => [] as string[],
            );
            for (const name of names) {
                const file = path.join(this.dir, folder, name);
                const info = await stat(file).catch(() => undefined);
                if (info?.isFile()) {
                    found.push({ file, size: info.size, time: info.mtimeMs });
                }
            }
        }
        return found;
    };

    /** Place prise ; au-delà de la limite, les plus anciennes sont effacées. */
    private added = async (bytes: number) => {
        this.total ??= (await this.files()).reduce((t, f) => t + f.size, 0);
        this.total += bytes;
        if (this.total <= this.maxBytes) return;
        const files = (await this.files()).sort((a, b) => a.time - b.time);
        let total = files.reduce((t, f) => t + f.size, 0);
        for (const file of files) {
            if (total <= this.maxBytes * PRUNE_TO) break;
            await rm(file.file, { force: true });
            total -= file.size;
        }
        this.total = total;
    };
}
