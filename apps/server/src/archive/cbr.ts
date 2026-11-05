import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';
import { access, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

import { writeZipFile } from './write';

const ZIP_MAGIC = Buffer.from('PK');
const RAR_MAGIC = Buffer.from('Rar!');

export const isCbr = (filePath: string) =>
    path.extname(filePath).toLowerCase() === '.cbr';

const startsWith = async (filePath: string, magic: Buffer) => {
    const file = await open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(magic.length);
        await file.read(buffer, 0, magic.length, 0);
        return buffer.equals(magic);
    } finally {
        await file.close();
    }
};

/** Archive RAR, quelle que soit son extension (des .cbz en sont parfois). */
export const isRarArchive = (filePath: string) =>
    startsWith(filePath, RAR_MAGIC);

const exists = (filePath: string) =>
    access(filePath).then(
        () => true,
        () => false,
    );

/**
 * Réécrit une archive RAR en ZIP vers `destPath`, de façon atomique : la
 * destination n'apparaît (ou n'est remplacée) qu'une fois complète.
 */
const rarToZip = async (srcPath: string, destPath: string) => {
    const file = await readFile(srcPath);
    const data = new ArrayBuffer(file.byteLength);
    new Uint8Array(data).set(file);
    const extractor = await createExtractorFromData({ data });
    const zip = new AdmZip();
    // `files` est un générateur : il faut le parcourir pour extraire.
    for (const file of extractor.extract().files) {
        if (file.fileHeader.flags.directory || !file.extraction) continue;
        zip.addFile(
            file.fileHeader.name.replace(/\\/g, '/'),
            Buffer.from(file.extraction),
        );
    }
    if (zip.getEntries().length === 0) {
        throw new Error('archive vide');
    }

    const tmpPath = `${destPath}.tmp`;
    try {
        await writeZipFile(zip, tmpPath);
        await rename(tmpPath, destPath);
    } catch (error) {
        await unlink(tmpPath).catch(() => undefined);
        throw error;
    }
};

/**
 * Convertit un .cbr en .cbz à côté de l'original, puis supprime le .cbr.
 * Beaucoup de .cbr sont en fait des ZIP renommés : ils sont simplement
 * renommés. Renvoie le chemin du .cbz.
 */
export const convertCbrToCbz = async (cbrPath: string): Promise<string> => {
    const cbzPath = cbrPath.replace(/\.cbr$/i, '.cbz');
    if (await exists(cbzPath)) {
        throw new Error(`${path.basename(cbzPath)} existe déjà`);
    }

    if (await startsWith(cbrPath, ZIP_MAGIC)) {
        await rename(cbrPath, cbzPath);
        return cbzPath;
    }

    // Le .cbr n'est supprimé qu'une fois le .cbz complet.
    await rarToZip(cbrPath, cbzPath);
    await unlink(cbrPath);
    return cbzPath;
};

/** Réécrit en vrai ZIP un .cbz qui contient en réalité une archive RAR. */
export const repairRarCbz = (cbzPath: string): Promise<void> =>
    rarToZip(cbzPath, cbzPath);
