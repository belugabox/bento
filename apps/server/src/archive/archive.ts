import AdmZip from 'adm-zip';
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { notFound, unprocessable } from '../tools/errors';
import { isMissingDescriptorError, repairDescriptorFlags } from './write';

const IMAGE_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
};

export const imageType = (entryName: string) =>
    IMAGE_TYPES[path.extname(entryName).toLowerCase()];

/** Pages d'une archive : ses images, dans l'ordre naturel des noms. */
export const pageEntries = (zip: AdmZip): AdmZip.IZipEntry[] =>
    zip
        .getEntries()
        .filter((entry) => !entry.isDirectory && imageType(entry.entryName))
        .sort((a, b) =>
            a.entryName.localeCompare(b.entryName, undefined, {
                numeric: true,
            }),
        );

const KNOWN_FORMATS: [Buffer, string][] = [
    [Buffer.from('Rar!'), 'archive RAR'],
    [
        Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
        'archive 7z, format non pris en charge',
    ],
    [Buffer.from('%PDF'), 'fichier PDF, pas une archive'],
];

/**
 * Raison lisible pour laquelle AdmZip ne sait pas lire une archive, d'après
 * sa taille et ses premiers octets.
 */
export const describeUnreadableArchive = async (
    fullPath: string,
    error: unknown,
): Promise<string> => {
    const message = error instanceof Error ? error.message : String(error);
    return (async () => {
        const file = await open(fullPath, 'r');
        try {
            const { size } = await file.stat();
            if (size === 0) return 'fichier vide';
            const head = Buffer.alloc(8);
            await file.read(head, 0, head.length, 0);
            if (head.subarray(0, 2).toString('latin1') === 'PK') {
                return message.includes('END header')
                    ? 'archive ZIP incomplète, la fin du fichier manque (téléchargement interrompu ou fichier abîmé à la source)'
                    : message;
            }
            const known = KNOWN_FORMATS.find(([magic]) =>
                head.subarray(0, magic.length).equals(magic),
            );
            return known?.[1] ?? "ce n'est pas une archive ZIP";
        } finally {
            await file.close();
        }
    })().catch(() => message);
};

/** Bit 3 des flags : CRC et tailles dans un descripteur après les données. */
const FLAG_DATA_DESCRIPTOR = 0x08;

/**
 * Archive abîmée par une ancienne réécriture (bit 3 gardé, descripteurs
 * perdus) : elle s'ouvre, mais ses entrées sont illisibles. Il suffit
 * d'essayer la première entrée marquée.
 */
const hasLostDescriptors = (zip: AdmZip) => {
    const marked = zip
        .getEntries()
        .find((e) => !e.isDirectory && e.header.flags & FLAG_DATA_DESCRIPTOR);
    if (!marked) return false;
    try {
        marked.getData();
        return false;
    } catch (error) {
        return isMissingDescriptorError(error);
    }
};

/**
 * Ouvre une archive, ou lève une erreur 422 avec une raison lisible. Une
 * archive aux descripteurs perdus est réparée au passage (si le fichier est
 * modifiable).
 */
export const openArchive = async (fullPath: string): Promise<AdmZip> => {
    let zip: AdmZip;
    try {
        zip = new AdmZip(fullPath);
    } catch (error) {
        throw unprocessable(
            `Archive illisible : ${await describeUnreadableArchive(fullPath, error)}`,
        );
    }
    if (hasLostDescriptors(zip)) {
        try {
            await repairDescriptorFlags(fullPath);
            zip = new AdmZip(fullPath);
        } catch {
            throw unprocessable(
                'Archive illisible : descripteurs ZIP perdus, réparation impossible (fichier en lecture seule ?)',
            );
        }
    }
    return zip;
};

type OpenArchive = { mtimeMs: number; pages: AdmZip.IZipEntry[] };

/**
 * Lecture page par page. Les dernières archives ouvertes restent en
 * mémoire : tourner les pages ne relit pas tout le fichier.
 */
export class PageReader {
    private archives = new Map<string, OpenArchive>();

    constructor(private readonly maxOpen = 4) {}

    private open = async (fullPath: string): Promise<OpenArchive> => {
        const { mtimeMs } = await stat(fullPath).catch(() => {
            throw notFound(`« ${path.basename(fullPath)} » n'existe plus`);
        });
        const cached = this.archives.get(fullPath);
        // Archive réécrite depuis : la rouvrir.
        if (cached && cached.mtimeMs === mtimeMs) {
            // Plus récemment utilisée : en fin de Map.
            this.archives.delete(fullPath);
            this.archives.set(fullPath, cached);
            return cached;
        }
        const archive = {
            mtimeMs,
            pages: pageEntries(await openArchive(fullPath)),
        };
        this.archives.delete(fullPath);
        this.archives.set(fullPath, archive);
        for (const oldest of this.archives.keys()) {
            if (this.archives.size <= this.maxOpen) break;
            this.archives.delete(oldest);
        }
        return archive;
    };

    /**
     * Largeur et hauteur de chaque page ([0, 0] pour une image illisible).
     * Décompresse tout le tome : à garder en cache.
     */
    sizes = async (fullPath: string): Promise<[number, number][]> => {
        const { pages } = await this.open(fullPath);
        const sizes: [number, number][] = [];
        for (const entry of pages) {
            const { width = 0, height = 0 } = await sharp(entry.getData())
                .metadata()
                .catch(() => ({ width: 0, height: 0 }));
            sizes.push([width, height]);
        }
        return sizes;
    };

    page = async (
        fullPath: string,
        index: number,
    ): Promise<{ data: Buffer; type: string }> => {
        const entry = (await this.open(fullPath)).pages[index];
        if (!entry) throw notFound(`Page ${index + 1} introuvable`);
        return { data: entry.getData(), type: imageType(entry.entryName)! };
    };
}
