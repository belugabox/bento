import AdmZip from 'adm-zip';
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openArchive, pageEntries, readArchive } from './archive';
import { withFileLock } from './fileLock';
import { readImage } from './image';
import { clearDescriptorFlags } from './write';

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

/**
 * Gain estimé en compressant quelques pages : le rapport obtenu sur elles
 * est appliqué à toutes les images.
 */
export const estimateCompression = async (
    fullPath: string,
    options: CompressionOptions,
): Promise<CompressionResult> => {
    const { size: originalSize } = await stat(fullPath);
    const pages = pageEntries(await readArchive(fullPath));
    const imagesSize = pages.reduce(
        (total, entry) => total + entry.compressedSize,
        0,
    );
    let before = 0;
    let after = 0;
    for (const entry of sampleOf(pages, SAMPLE_PAGES)) {
        const data = await entry.getData();
        const compressed = await recompress(data, entry.entryName, options);
        before += data.length;
        after += compressed?.length ?? data.length;
    }
    const ratio = before > 0 ? after / before : 1;
    return {
        originalSize,
        compressedSize: Math.round(originalSize - imagesSize * (1 - ratio)),
    };
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
    const buffer = output.toBuffer();
    if (buffer.length >= originalSize) {
        return { originalSize, compressedSize: originalSize };
    }
    // Écrit sur place : le fichier garde son propriétaire (volume Docker).
    await writeFile(fullPath, buffer);
    return { originalSize, compressedSize: buffer.length };
};
