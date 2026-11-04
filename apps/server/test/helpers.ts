import AdmZip from 'adm-zip';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pino } from 'pino';
import sharp from 'sharp';

import { PageReader } from '../src/archive/archive';
import { openDatabase } from '../src/db';
import { syncLibraries } from '../src/library/catalog';
import { LibraryScanner } from '../src/library/scanner';

export const silent = pino({ level: 'silent' });

/** Petite image PNG unie (vraie image : sharp doit pouvoir la lire). */
export const png = (color: string) =>
    sharp({
        create: { width: 20, height: 30, channels: 3, background: color },
    })
        .png()
        .toBuffer();

/** Écrit un CBZ : pages nommées, ComicInfo optionnel. */
export const writeCbz = async (
    fullPath: string,
    { pages = 2, comicInfo }: { pages?: number; comicInfo?: string } = {},
) => {
    const zip = new AdmZip();
    for (let i = 1; i <= pages; i++) {
        zip.addFile(`p${i}.png`, await png(i % 2 ? '#ff0000' : '#0000ff'));
    }
    if (comicInfo) {
        zip.addFile(
            'ComicInfo.xml',
            Buffer.from(
                `<?xml version="1.0"?><ComicInfo>${comicInfo}</ComicInfo>`,
            ),
        );
    }
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, zip.toBuffer());
};

/** Bibliothèque temporaire, base en mémoire et scanner prêts à l'emploi. */
export const setup = async (type: 'manga' | 'comics' = 'manga') => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bento-'));
    const root = path.join(dir, 'library');
    const coversPath = path.join(dir, 'covers');
    await mkdir(root, { recursive: true });
    const database = openDatabase(':memory:');
    const [library] = await syncLibraries(
        database.db,
        [{ name: 'Mangas', path: root, type }],
        coversPath,
    );
    const scanner = new LibraryScanner(database.db, coversPath, silent);
    return {
        db: database.db,
        root,
        coversPath,
        library: library!,
        scanner,
        pages: new PageReader(),
        file: (relative: string) => path.join(root, ...relative.split('/')),
        cleanup: async () => {
            database.close();
            await rm(dir, { recursive: true, force: true });
        },
    };
};
