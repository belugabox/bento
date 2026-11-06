import AdmZip from 'adm-zip';
import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { notFound, unprocessable } from '../tools/errors';
import { readImage } from './image';
import { isMissingDescriptorError, repairDescriptorFlags } from './write';
import { descriptorsLost, readZipEntries, readZipEntry } from './zipIndex';

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
export const pageEntries = <
    T extends { entryName: string; isDirectory: boolean },
>(
    entries: T[],
): T[] =>
    entries
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
        // Lu sans bloquer : AdmZip lirait le fichier en synchrone.
        zip = new AdmZip(await readFile(fullPath));
    } catch (error) {
        throw unprocessable(
            `Archive illisible : ${await describeUnreadableArchive(fullPath, error)}`,
        );
    }
    if (hasLostDescriptors(zip)) {
        try {
            await repairDescriptorFlags(fullPath);
            zip = new AdmZip(await readFile(fullPath));
        } catch {
            throw unprocessable(
                'Archive illisible : descripteurs ZIP perdus, réparation impossible (fichier en lecture seule ?)',
            );
        }
    }
    return zip;
};

/** Entrée d'une archive en lecture seule, lue à la demande. */
export type ArchiveEntry = {
    entryName: string;
    isDirectory: boolean;
    compressedSize: number;
    getData: () => Promise<Buffer>;
    /** Premiers octets seulement (tout le contenu s'il est plus court). */
    getStart: (bytes: number) => Promise<Buffer>;
};

/**
 * Entrées d'une archive, sans la charger : seul son répertoire est lu, puis
 * chaque entrée à la demande. Une archive inhabituelle ou abîmée passe par
 * AdmZip (`openArchive`), qui la lit en entier, la répare au besoin ou dit
 * pourquoi elle est illisible.
 */
export const readArchive = async (
    fullPath: string,
): Promise<ArchiveEntry[]> => {
    const entries = await readZipEntries(fullPath).catch(() => undefined);
    if (
        entries &&
        !(await descriptorsLost(fullPath, entries).catch(() => true))
    ) {
        return entries.map((entry) => ({
            entryName: entry.entryName,
            isDirectory: entry.isDirectory,
            compressedSize: entry.compressedSize,
            getData: () => readZipEntry(fullPath, entry),
            getStart: (bytes) => readZipEntry(fullPath, entry, bytes),
        }));
    }
    return (await openArchive(fullPath)).getEntries().map((entry) => ({
        entryName: entry.entryName,
        isDirectory: entry.isDirectory,
        compressedSize: entry.header.compressedSize,
        getData: async () => entry.getData(),
        getStart: async (bytes) => entry.getData().subarray(0, bytes),
    }));
};

type OpenArchive = { mtimeMs: number; pages: ArchiveEntry[] };

/** Début d'une image où chercher ses dimensions (EXIF compris). */
const HEADER_BYTES = 64 * 1024;

const sizeOf = async (data: Buffer): Promise<[number, number] | undefined> => {
    const { width, height } = await readImage(data)
        .metadata()
        .catch(() => ({ width: undefined, height: undefined }));
    return width && height ? [width, height] : undefined;
};

/**
 * Lecture page par page. Le répertoire des dernières archives ouvertes
 * reste en mémoire : tourner une page ne lit que cette page.
 */
export class PageReader {
    private archives = new Map<string, OpenArchive>();

    constructor(private readonly maxOpen = 16) {}

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
            pages: pageEntries(await readArchive(fullPath)),
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
     * Seul le début de chaque image est lu, sauf si ses dimensions n'y sont
     * pas : à garder en cache tout de même.
     */
    sizes = async (fullPath: string): Promise<[number, number][]> => {
        const { pages } = await this.open(fullPath);
        const sizes: [number, number][] = [];
        for (const entry of pages) {
            const size =
                (await sizeOf(await entry.getStart(HEADER_BYTES))) ??
                (await sizeOf(await entry.getData()));
            sizes.push(size ?? [0, 0]);
        }
        return sizes;
    };

    page = async (
        fullPath: string,
        index: number,
    ): Promise<{ data: Buffer; type: string }> => {
        const entry = (await this.open(fullPath)).pages[index];
        if (!entry) throw notFound(`Page ${index + 1} introuvable`);
        return {
            data: await entry.getData(),
            type: imageType(entry.entryName)!,
        };
    };
}
