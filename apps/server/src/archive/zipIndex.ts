import { type FileHandle, open } from 'node:fs/promises';
import { promisify } from 'node:util';
import { inflateRaw } from 'node:zlib';

const inflate = promisify(inflateRaw);

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_END = 0x06064b50;
/** Taille fixe de la fin de répertoire, plus un commentaire de 64 Ko au plus. */
const END_SIZE = 22;
const MAX_TAIL = END_SIZE + 0xffff;
const STORED = 0;
const DEFLATED = 8;
const FLAG_ENCRYPTED = 0x01;
/** Bit 3 des flags : CRC et tailles dans un descripteur après les données. */
const FLAG_DATA_DESCRIPTOR = 0x08;

/** Entrée d'une archive ZIP, lue dans son répertoire central. */
export type ZipEntry = {
    entryName: string;
    isDirectory: boolean;
    flags: number;
    method: number;
    compressedSize: number;
    size: number;
    /** Position de l'en-tête local dans le fichier. */
    offset: number;
};

const readAt = async (file: FileHandle, position: number, length: number) => {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, position);
    if (bytesRead < length) throw new Error('archive ZIP tronquée');
    return buffer;
};

/** Position, taille et nombre d'entrées du répertoire central. */
const centralDirectoryOf = async (file: FileHandle, fileSize: number) => {
    const tailSize = Math.min(fileSize, MAX_TAIL);
    const tail = await readAt(file, fileSize - tailSize, tailSize);
    let end = -1;
    for (let i = tail.length - END_SIZE; i >= 0; i--) {
        if (tail.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
            end = i;
            break;
        }
    }
    if (end < 0) throw new Error('fin du répertoire ZIP introuvable');
    let count = tail.readUInt16LE(end + 10);
    let size = tail.readUInt32LE(end + 12);
    let offset = tail.readUInt32LE(end + 16);
    // Zip64 : le localisateur précède la fin du répertoire.
    const locator = end - 20;
    if (locator >= 0 && tail.readUInt32LE(locator) === ZIP64_LOCATOR) {
        const zip64End = Number(tail.readBigUInt64LE(locator + 8));
        const record = await readAt(file, zip64End, 56);
        if (record.readUInt32LE(0) !== ZIP64_END) {
            throw new Error('répertoire Zip64 introuvable');
        }
        count = Number(record.readBigUInt64LE(32));
        size = Number(record.readBigUInt64LE(40));
        offset = Number(record.readBigUInt64LE(48));
    }
    if (offset + size > fileSize) throw new Error('archive ZIP tronquée');
    return { count, size, offset };
};

/** Tailles et position sur 64 bits, dans le champ extra 0x0001. */
const applyZip64 = (extra: Buffer, entry: ZipEntry) => {
    for (let i = 0; i + 4 <= extra.length;) {
        const id = extra.readUInt16LE(i);
        const length = extra.readUInt16LE(i + 2);
        if (id === 0x0001) {
            let field = i + 4;
            const next = () => {
                const value = Number(extra.readBigUInt64LE(field));
                field += 8;
                return value;
            };
            if (entry.size === 0xffffffff) entry.size = next();
            if (entry.compressedSize === 0xffffffff) {
                entry.compressedSize = next();
            }
            if (entry.offset === 0xffffffff) entry.offset = next();
            return;
        }
        i += 4 + length;
    }
};

const parseEntries = (directory: Buffer, count: number) => {
    const entries: ZipEntry[] = [];
    let i = 0;
    for (let n = 0; n < count; n++) {
        if (directory.readUInt32LE(i) !== CENTRAL_HEADER) {
            throw new Error('répertoire ZIP invalide');
        }
        const nameLength = directory.readUInt16LE(i + 28);
        const extraLength = directory.readUInt16LE(i + 30);
        const commentLength = directory.readUInt16LE(i + 32);
        // Noms en UTF-8, comme AdmZip.
        const entryName = directory.toString(
            'utf8',
            i + 46,
            i + 46 + nameLength,
        );
        const entry: ZipEntry = {
            entryName,
            isDirectory: entryName.endsWith('/'),
            flags: directory.readUInt16LE(i + 8),
            method: directory.readUInt16LE(i + 10),
            compressedSize: directory.readUInt32LE(i + 20),
            size: directory.readUInt32LE(i + 24),
            offset: directory.readUInt32LE(i + 42),
        };
        applyZip64(
            directory.subarray(
                i + 46 + nameLength,
                i + 46 + nameLength + extraLength,
            ),
            entry,
        );
        entries.push(entry);
        i += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
};

/**
 * Entrées d'une archive ZIP, d'après son seul répertoire central : quelques
 * Ko lus à la fin du fichier, sans charger le reste ni bloquer le serveur.
 */
export const readZipEntries = async (fullPath: string): Promise<ZipEntry[]> => {
    const file = await open(fullPath, 'r');
    try {
        const { size: fileSize } = await file.stat();
        const directory = await centralDirectoryOf(file, fileSize);
        return parseEntries(
            await readAt(file, directory.offset, directory.size),
            directory.count,
        );
    } finally {
        await file.close();
    }
};

/** Position des données d'une entrée, après son en-tête local. */
const dataOffsetOf = async (file: FileHandle, entry: ZipEntry) => {
    const header = await readAt(file, entry.offset, 30);
    if (header.readUInt32LE(0) !== LOCAL_HEADER) {
        throw new Error(`en-tête de « ${entry.entryName} » introuvable`);
    }
    return (
        entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
    );
};

/** Contenu décompressé d'une entrée (le fichier est ouvert le temps de la lire). */
export const readZipEntry = async (
    fullPath: string,
    entry: ZipEntry,
): Promise<Buffer> => {
    if (entry.isDirectory) return Buffer.alloc(0);
    if (entry.flags & FLAG_ENCRYPTED) {
        throw new Error(`« ${entry.entryName} » est chiffré`);
    }
    if (entry.method !== STORED && entry.method !== DEFLATED) {
        throw new Error(
            `« ${entry.entryName} » : compression ${entry.method} non prise en charge`,
        );
    }
    const file = await open(fullPath, 'r');
    let data: Buffer;
    try {
        data = await readAt(
            file,
            await dataOffsetOf(file, entry),
            entry.compressedSize,
        );
    } finally {
        await file.close();
    }
    return entry.method === STORED ? data : inflate(data);
};

/**
 * Archive abîmée par une ancienne réécriture : bit 3 gardé, mais l'entrée
 * est suivie directement d'un en-tête au lieu de son descripteur. AdmZip
 * refuse alors de la lire ; il suffit d'essayer la première entrée marquée.
 */
export const descriptorsLost = async (
    fullPath: string,
    entries: ZipEntry[],
) => {
    const marked = entries.find(
        (e) => !e.isDirectory && e.flags & FLAG_DATA_DESCRIPTOR,
    );
    if (!marked) return false;
    const file = await open(fullPath, 'r');
    try {
        const end = (await dataOffsetOf(file, marked)) + marked.compressedSize;
        const signature = (await readAt(file, end, 4)).readUInt32LE(0);
        return signature === LOCAL_HEADER || signature === CENTRAL_HEADER;
    } finally {
        await file.close();
    }
};
