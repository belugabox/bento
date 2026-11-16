import AdmZip from 'adm-zip';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { convertPdfToCbz, isPdf } from '../src/archive/pdf';
import { setup } from './helpers';

const jpeg = (color: string) =>
    sharp({
        create: { width: 60, height: 90, channels: 3, background: color },
    })
        .jpeg()
        .toBuffer();

const png = () =>
    sharp({
        create: { width: 40, height: 30, channels: 3, background: '#808080' },
    })
        .png()
        .toBuffer();

/** PDF de scans : une image par page, comme les PDF déposés. */
const scanPdf = async (
    pages: (Buffer | 'text' | { png: Buffer })[],
    rotate?: number,
) => {
    const doc = await PDFDocument.create();
    for (const content of pages) {
        if (content === 'text') {
            const page = doc.addPage([200, 300]);
            const font = await doc.embedFont(StandardFonts.Helvetica);
            page.drawText('Bonjour', { x: 20, y: 150, font });
            continue;
        }
        const image = Buffer.isBuffer(content)
            ? await doc.embedJpg(content)
            : await doc.embedPng(content.png);
        const page = doc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0 });
        if (rotate) page.setRotation(degrees(rotate));
    }
    return Buffer.from(await doc.save());
};

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pdf-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('PDF drafts', () => {
    it('recognizes PDF files', () => {
        expect(isPdf('Tome 01.PDF')).toBe(true);
        expect(isPdf('Tome 01.cbz')).toBe(false);
    });

    it('keeps the JPEG of each page as is, in order, then removes the PDF', async () => {
        const images = await Promise.all(
            ['#ff0000', '#00ff00', '#0000ff'].map(jpeg),
        );
        const pdf = path.join(dir, 'Inuyashiki Tome 01.pdf');
        await writeFile(pdf, await scanPdf(images));

        const cbz = await convertPdfToCbz(pdf);

        expect(path.basename(cbz)).toBe('Inuyashiki Tome 01.cbz');
        expect(await readdir(dir)).toEqual(['Inuyashiki Tome 01.cbz']);
        const entries = new AdmZip(cbz).getEntries();
        expect(entries.map((e) => e.entryName)).toEqual([
            '001.jpg',
            '002.jpg',
            '003.jpg',
        ]);
        // Aucune perte : les octets d'origine.
        entries.forEach((entry, i) =>
            expect(entry.getData().equals(images[i]!)).toBe(true),
        );
    });

    it('encodes a page that is not a JPEG, and turns a rotated page', async () => {
        const pdf = path.join(dir, 'Tome 02.pdf');
        await writeFile(pdf, await scanPdf([{ png: await png() }]));
        const [page] = new AdmZip(await convertPdfToCbz(pdf)).getEntries();
        const meta = await sharp(page!.getData()).metadata();
        expect(meta).toMatchObject({ format: 'jpeg', width: 40, height: 30 });

        const rotated = path.join(dir, 'Tome 03.pdf');
        await writeFile(rotated, await scanPdf([await jpeg('#fff')], 90));
        const [turned] = new AdmZip(
            await convertPdfToCbz(rotated),
        ).getEntries();
        expect(await sharp(turned!.getData()).metadata()).toMatchObject({
            width: 90,
            height: 60,
        });
    });

    it('refuses a page that is not a single image, and keeps the PDF', async () => {
        const pdf = path.join(dir, 'Roman.pdf');
        await writeFile(pdf, await scanPdf([await jpeg('#fff'), 'text']));

        await expect(convertPdfToCbz(pdf)).rejects.toThrow(
            'page 2 : pas une image simple',
        );
        expect(await readdir(dir)).toEqual(['Roman.pdf']);
    });

    it('never overwrites an existing .cbz', async () => {
        const pdf = path.join(dir, 'Tome 04.pdf');
        await writeFile(pdf, await scanPdf([await jpeg('#fff')]));
        await writeFile(path.join(dir, 'Tome 04.cbz'), 'déjà là');

        await expect(convertPdfToCbz(pdf)).rejects.toThrow('existe déjà');
        expect((await readdir(dir)).sort()).toEqual([
            'Tome 04.cbz',
            'Tome 04.pdf',
        ]);
    });
});

describe('a draft folder of PDF files', () => {
    let ctx: Awaited<ReturnType<typeof setup>>;

    beforeEach(async () => {
        ctx = await setup();
    });

    afterEach(async () => {
        await ctx.cleanup();
    });

    it('shows the folder, converts in the background, then lists the volumes', async () => {
        await mkdir(ctx.file('_draft/Inuyashiki'), { recursive: true });
        await writeFile(
            ctx.file('_draft/Inuyashiki/Inuyashiki Tome 01.pdf'),
            await scanPdf([await jpeg('#fff'), await jpeg('#000')]),
        );

        expect(await ctx.files.pendingSeries()).toBe(1);
        const drafts = await ctx.files.drafts(ctx.library.id);
        expect(drafts.map((d) => d.folder)).toEqual(['_draft/Inuyashiki']);

        // À l'ouverture : en conversion, sans faire attendre.
        const during = await ctx.files.draftFolder(
            ctx.library.id,
            '_draft/Inuyashiki',
        );
        expect(during).toEqual([
            expect.objectContaining({
                path: '_draft/Inuyashiki/Inuyashiki Tome 01.pdf',
                converting: true,
                error: 'Conversion du PDF en cours…',
            }),
        ]);

        await ctx.files.pdfConversions();
        const after = await ctx.files.draftFolder(
            ctx.library.id,
            '_draft/Inuyashiki',
        );
        expect(after).toEqual([
            expect.objectContaining({
                path: '_draft/Inuyashiki/Inuyashiki Tome 01.cbz',
                pageCount: 2,
                error: null,
            }),
        ]);
        expect(after[0]!.converting).toBeUndefined();
    });

    it('keeps a PDF it cannot convert, with the reason', async () => {
        await mkdir(ctx.file('_draft/Roman'), { recursive: true });
        await writeFile(ctx.file('_draft/Roman/Roman.pdf'), 'pas un PDF');

        await ctx.files.draftFolder(ctx.library.id, '_draft/Roman');
        await ctx.files.pdfConversions();
        const [file] = await ctx.files.draftFolder(
            ctx.library.id,
            '_draft/Roman',
        );

        expect(file).toMatchObject({ path: '_draft/Roman/Roman.pdf' });
        expect(file!.error).toMatch(/Conversion en CBZ impossible/);
        expect(file!.converting).toBeUndefined();
    });
});
