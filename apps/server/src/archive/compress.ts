import AdmZip from 'adm-zip';
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openArchive, pageEntries, readArchive } from './archive';
import { withFileLock } from './fileLock';
import { readImage } from './image';
import { clearDescriptorFlags } from './write';
import { readZipComment } from './zipIndex';

/**
 * Réglages de la compression (réglables par l'admin) : qualité JPEG et
 * hauteur maximale des pages (null : taille gardée). Les GIF (animés) et
 * les images que la compression grossirait restent telles quelles.
 */
export type CompressionOptions = { quality: number; maxHeight: number | null };

// Pages traitées en même temps.
const PARALLEL_PAGES = 4;
// Méthode ZIP « stocké » (sans compression).
const STORED = 0;
// Pages compressées pour estimer le gain d'un tome.
const SAMPLE_PAGES = 8;
// Tomes échantillonnés pour estimer une série (début, milieu, fin) : ceux
// d'une même série viennent en général du même scan.
const SAMPLE_FILES = 3;

/**
 * Marque laissée dans le commentaire de l'archive par la compression, avec
 * ses réglages : « bento:compressed q=90 h=2400 » (h=0 : taille gardée).
 */
const MARK = /^bento:compressed q=(\d+) h=(\d+)$/;
const markOf = ({ quality, maxHeight }: CompressionOptions) =>
    `bento:compressed q=${quality} h=${maxHeight ?? 0}`;

/**
 * Déjà compressé avec des réglages au moins aussi forts : rien à gagner (et
 * recompresser un JPEG ne ferait que l'abîmer).
 */
export const alreadyCompressed = async (
    fullPath: string,
    { quality, maxHeight }: CompressionOptions,
) => {
    const mark = MARK.exec(await readZipComment(fullPath).catch(() => ''));
    if (!mark) return false;
    const markHeight = Number(mark[2]) || null;
    return (
        Number(mark[1]) <= quality &&
        (maxHeight === null || (markHeight !== null && markHeight <= maxHeight))
    );
};

/** Lance `task` sur chaque élément, `PARALLEL_PAGES` à la fois. */
const inBatches = async <T, R>(items: T[], task: (item: T) => Promise<R>) => {
    const results: R[] = [];
    for (let start = 0; start < items.length; start += PARALLEL_PAGES) {
        results.push(
            ...(await Promise.all(
                items.slice(start, start + PARALLEL_PAGES).map(task),
            )),
        );
    }
    return results;
};

export type CompressionResult = {
    originalSize: number;
    // Estimée, ou obtenue.
    compressedSize: number;
};

/** Page recompressée, ou null si elle n'y gagne pas. */
const recompress = async (
    data: Buffer,
    entryName: string,
    { quality, maxHeight }: CompressionOptions,
) => {
    if (path.extname(entryName).toLowerCase() === '.gif') return null;
    let image = readImage(data).rotate();
    if (maxHeight) {
        image = image.resize({
            height: maxHeight,
            fit: 'inside',
            withoutEnlargement: true,
        });
    }
    const compressed = await image
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
        .catch(() => null);
    return compressed && compressed.length < data.length ? compressed : null;
};

/** Nom de la page en JPEG, sans changer sa place dans l'ordre des pages. */
const jpegName = (entryName: string) => entryName.replace(/\.[^./]+$/, '.jpg');

/** Pages réparties dans tout le tome (couverture, milieu, fin). */
const sampleOf = <T>(items: T[], count: number) =>
    items.length <= count
        ? items
        : Array.from(
              { length: count },
              (_, i) =>
                  items[Math.floor((i * (items.length - 1)) / (count - 1))]!,
          );

/** Taille d'un fichier et de ses images (lue dans son répertoire). */
const sizesOf = async (fullPath: string) => {
    const { size } = await stat(fullPath);
    const pages = pageEntries(await readArchive(fullPath));
    return {
        size,
        pages,
        imagesSize: pages.reduce((t, entry) => t + entry.compressedSize, 0),
    };
};

/**
 * Tailles avant et après sur quelques pages d'un fichier, recompressées
 * `PARALLEL_PAGES` à la fois.
 */
const samplePages = async (
    pages: Awaited<ReturnType<typeof sizesOf>>['pages'],
    options: CompressionOptions,
) => {
    const sizes = await inBatches(
        sampleOf(pages, SAMPLE_PAGES),
        async (entry) => {
            const data = await entry.getData();
            const compressed = await recompress(data, entry.entryName, options);
            return [data.length, compressed?.length ?? data.length] as const;
        },
    );
    return {
        before: sizes.reduce((t, [before]) => t + before, 0),
        after: sizes.reduce((t, [, after]) => t + after, 0),
    };
};

const estimated = (size: number, imagesSize: number, ratio: number) =>
    Math.round(size - imagesSize * (1 - ratio));

/**
 * Gain estimé d'un ensemble de fichiers (les tomes d'une série) : quelques
 * pages de trois d'entre eux (début, milieu, fin) sont recompressées, et le
 * rapport obtenu est appliqué aux images de tous. Un fichier déjà compressé
 * avec ces réglages n'y gagne rien ; un fichier illisible a son erreur.
 */
export const estimateCompression = async (
    fullPaths: string[],
    options: CompressionOptions,
): Promise<Record<string, CompressionResult | { error: string }>> => {
    const results: Record<string, CompressionResult | { error: string }> = {};
    const todo: {
        fullPath: string;
        size: number;
        imagesSize: number;
        pages: Awaited<ReturnType<typeof sizesOf>>['pages'];
    }[] = [];
    for (const fullPath of fullPaths) {
        try {
            const sizes = await sizesOf(fullPath);
            if (await alreadyCompressed(fullPath, options)) {
                results[fullPath] = {
                    originalSize: sizes.size,
                    compressedSize: sizes.size,
                };
            } else {
                todo.push({ fullPath, ...sizes });
            }
        } catch (e) {
            results[fullPath] = { error: (e as Error).message };
        }
    }
    // Rapport de chaque fichier échantillonné, et celui de l'ensemble.
    const own = new Map<string, number>();
    let before = 0;
    let after = 0;
    for (const file of sampleOf(todo, SAMPLE_FILES)) {
        try {
            const sample = await samplePages(file.pages, options);
            if (sample.before > 0) {
                own.set(file.fullPath, sample.after / sample.before);
            }
            before += sample.before;
            after += sample.after;
        } catch (e) {
            results[file.fullPath] = { error: (e as Error).message };
        }
    }
    const ratio = before > 0 ? after / before : 1;
    for (const file of todo) {
        if (results[file.fullPath]) continue;
        results[file.fullPath] = {
            originalSize: file.size,
            compressedSize: estimated(
                file.size,
                file.imagesSize,
                own.get(file.fullPath) ?? ratio,
            ),
        };
    }
    return results;
};

/**
 * Recompresse les pages d'un tome. Le fichier n'est réécrit que s'il y
 * gagne ; le ComicInfo et les autres fichiers sont gardés. Un enregistrement
 * du ComicInfo pendant ce temps attend la fin (il serait effacé).
 */
export const compressArchive = (
    fullPath: string,
    options: CompressionOptions,
): Promise<CompressionResult> =>
    withFileLock(fullPath, () => compressPages(fullPath, options));

const compressPages = async (
    fullPath: string,
    options: CompressionOptions,
): Promise<CompressionResult> => {
    const { size: originalSize } = await stat(fullPath);
    // Déjà compressé ainsi : rien à gagner, et la qualité baisserait.
    if (await alreadyCompressed(fullPath, options)) {
        return { originalSize, compressedSize: originalSize };
    }
    const zip = await openArchive(fullPath);
    const pages = new Set(
        pageEntries(zip.getEntries()).map((entry) => entry.entryName),
    );
    const names = new Set(zip.getEntries().map((entry) => entry.entryName));
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
    const output = new AdmZip();
    let changed = 0;
    // Quelques pages à la fois : plus rapide, sans tout garder en mémoire.
    for (let start = 0; start < entries.length; start += PARALLEL_PAGES) {
        const batch = entries.slice(start, start + PARALLEL_PAGES);
        const results = await Promise.all(
            batch.map(async (entry) => {
                const data = entry.getData();
                return {
                    entry,
                    data,
                    compressed: pages.has(entry.entryName)
                        ? await recompress(data, entry.entryName, options)
                        : null,
                };
            }),
        );
        for (const { entry, data, compressed } of results) {
            let name = entry.entryName;
            let content = data;
            const renamed = jpegName(name);
            // « 01.png » et « 01.jpg » dans la même archive : ne rien écraser.
            if (compressed && (renamed === name || !names.has(renamed))) {
                name = renamed;
                names.add(renamed);
                content = compressed;
                changed++;
            }
            output.addFile(name, content);
            // Images déjà compressées : rangées telles quelles (sans deflate).
            if (pages.has(entry.entryName)) {
                output.getEntry(name)!.header.method = STORED;
            }
        }
    }
    if (changed === 0) return { originalSize, compressedSize: originalSize };
    clearDescriptorFlags(output);
    // Réglages utilisés, gardés dans l'archive (estimations suivantes).
    output.addZipComment(markOf(options));
    const buffer = output.toBuffer();
    if (buffer.length >= originalSize) {
        return { originalSize, compressedSize: originalSize };
    }
    // Écrit sur place : le fichier garde son propriétaire (volume Docker).
    await writeFile(fullPath, buffer);
    return { originalSize, compressedSize: buffer.length };
};
