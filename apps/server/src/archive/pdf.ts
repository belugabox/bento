import AdmZip from 'adm-zip';
import { access, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import {
    PDFArray,
    PDFDict,
    PDFDocument,
    PDFName,
    PDFNumber,
    type PDFObject,
    PDFRawStream,
    PDFRef,
} from 'pdf-lib';
import sharp from 'sharp';

import { writeZipFile } from './write';

const STORED = 0;
// Pages réencodées (rotation, CMYK, image non JPEG).
const QUALITY = 90;

export const isPdf = (filePath: string) =>
    path.extname(filePath).toLowerCase() === '.pdf';

const exists = (filePath: string) =>
    access(filePath).then(
        () => true,
        () => false,
    );

type Image = { stream: PDFRawStream; filters: string[] };

const nameOf = (value: PDFObject | undefined) =>
    value instanceof PDFName ? value.asString() : undefined;

/** Filtres d'un flux (« /DCTDecode », ou une liste). */
const filtersOf = (dict: PDFDict) => {
    const filter = dict.lookup(PDFName.of('Filter'));
    if (filter instanceof PDFArray) {
        return filter.asArray().map((f) => nameOf(f) ?? '?');
    }
    const name = nameOf(filter);
    return name ? [name] : [];
};

/**
 * Images d'une page : celles de ses ressources, et celles des formulaires
 * qu'elle contient (certains PDF y rangent l'image de la page).
 */
const imagesOf = (
    doc: PDFDocument,
    resources: PDFDict | undefined,
    depth = 0,
): Image[] => {
    const xObjects = resources?.lookup(PDFName.of('XObject'));
    if (!(xObjects instanceof PDFDict) || depth > 2) return [];
    const images: Image[] = [];
    for (const [, ref] of xObjects.entries()) {
        const stream =
            ref instanceof PDFRef ? doc.context.lookup(ref) : (ref as unknown);
        if (!(stream instanceof PDFRawStream)) continue;
        const subtype = nameOf(stream.dict.get(PDFName.of('Subtype')));
        if (subtype === '/Image') {
            images.push({ stream, filters: filtersOf(stream.dict) });
        } else if (subtype === '/Form') {
            const inner = stream.dict.lookup(PDFName.of('Resources'));
            images.push(
                ...imagesOf(
                    doc,
                    inner instanceof PDFDict ? inner : undefined,
                    depth + 1,
                ),
            );
        }
    }
    return images;
};

/** Nombre de composantes d'un espace de couleur, s'il est connu. */
const channelsOf = (stream: PDFRawStream) => {
    const space = stream.dict.lookup(PDFName.of('ColorSpace'));
    const name = nameOf(space);
    if (name === '/DeviceRGB') return 3;
    if (name === '/DeviceGray') return 1;
    if (name === '/DeviceCMYK') return 4;
    // [/ICCBased <flux avec /N>]
    if (space instanceof PDFArray && nameOf(space.get(0)) === '/ICCBased') {
        const profile = space.lookup(1);
        const n =
            profile instanceof PDFRawStream
                ? profile.dict.lookup(PDFName.of('N'))
                : undefined;
        if (n instanceof PDFNumber) return n.asNumber();
    }
    return undefined;
};

const numberOf = (dict: PDFDict, key: string) => {
    const value = dict.lookup(PDFName.of(key));
    return value instanceof PDFNumber ? value.asNumber() : undefined;
};

/**
 * Image d'une page en JPEG : telle quelle quand c'est déjà un JPEG (le cas
 * des scans), sinon décodée puis encodée. `undefined` si elle n'est pas
 * prise en charge.
 */
const pageJpeg = async (image: Image, rotation: number) => {
    const { stream, filters } = image;
    const channels = channelsOf(stream);
    let jpeg: Buffer | undefined;
    if (filters.length === 1 && filters[0] === '/DCTDecode') {
        jpeg = Buffer.from(stream.contents);
        // CMYK : mal affiché par certains navigateurs, converti en RVB.
        if (channels === 4 || rotation) {
            jpeg = await sharp(jpeg)
                .rotate(rotation || undefined)
                .toColourspace('srgb')
                .jpeg({ quality: QUALITY })
                .toBuffer();
        }
        return jpeg;
    }
    // Pixels compressés par zlib, 8 bits, en niveaux de gris ou en RVB.
    const params = stream.dict.lookup(PDFName.of('DecodeParms'));
    const predictor =
        params instanceof PDFDict ? numberOf(params, 'Predictor') : undefined;
    const width = numberOf(stream.dict, 'Width');
    const height = numberOf(stream.dict, 'Height');
    if (
        filters.length === 1 &&
        filters[0] === '/FlateDecode' &&
        (predictor ?? 1) === 1 &&
        numberOf(stream.dict, 'BitsPerComponent') === 8 &&
        (channels === 1 || channels === 3) &&
        width &&
        height
    ) {
        const pixels = inflateSync(stream.contents);
        if (pixels.length < width * height * channels) return undefined;
        return sharp(pixels.subarray(0, width * height * channels), {
            raw: { width, height, channels },
        })
            .rotate(rotation || undefined)
            .jpeg({ quality: QUALITY })
            .toBuffer();
    }
    return undefined;
};

/**
 * Pages d'un PDF de scans en JPEG, dans l'ordre. Chaque page doit être une
 * seule image : un PDF de texte (ou de pages composées) est refusé.
 */
export const pdfPages = async (data: Uint8Array) => {
    const doc = await PDFDocument.load(data, {
        ignoreEncryption: true,
        updateMetadata: false,
    });
    const pages: Buffer[] = [];
    for (const [index, page] of doc.getPages().entries()) {
        const images = imagesOf(doc, page.node.Resources());
        const jpeg =
            images.length === 1
                ? await pageJpeg(images[0]!, page.getRotation().angle % 360)
                : undefined;
        if (!jpeg) {
            throw new Error(
                `page ${index + 1} : pas une image simple, PDF non pris en charge`,
            );
        }
        pages.push(jpeg);
    }
    if (pages.length === 0) throw new Error('PDF sans page');
    return pages;
};

/**
 * Convertit un PDF de scans en .cbz à côté de l'original, puis supprime le
 * PDF (seulement une fois le .cbz complet). Les JPEG sont repris tels
 * quels : aucune perte. Renvoie le chemin du .cbz.
 */
export const convertPdfToCbz = async (pdfPath: string): Promise<string> => {
    const cbzPath = pdfPath.replace(/\.pdf$/i, '.cbz');
    if (await exists(cbzPath)) {
        throw new Error(`${path.basename(cbzPath)} existe déjà`);
    }
    const pages = await pdfPages(await readFile(pdfPath));
    const digits = Math.max(3, String(pages.length).length);
    const zip = new AdmZip();
    for (const [index, jpeg] of pages.entries()) {
        const name = `${String(index + 1).padStart(digits, '0')}.jpg`;
        zip.addFile(name, jpeg);
        // Déjà compressées : rangées telles quelles (sans deflate).
        zip.getEntry(name)!.header.method = STORED;
    }
    const tmpPath = `${cbzPath}.tmp`;
    try {
        await writeZipFile(zip, tmpPath);
        await rename(tmpPath, cbzPath);
    } catch (error) {
        await unlink(tmpPath).catch(() => undefined);
        throw error;
    }
    await unlink(pdfPath);
    return cbzPath;
};
