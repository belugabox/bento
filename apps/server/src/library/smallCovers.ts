import { randomBytes } from 'node:crypto';
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';

import { readImage } from '../archive/image';

// Vignettes des grilles : 200 × 300, assez pour un écran à haute densité.
const SMALL_WIDTH = 200;

/** Version réduite d'une couverture, rangée à côté de celle-ci. */
export const smallCoverFile = (file: string) =>
    file.replace(/\.webp$/, '.small.webp');

/**
 * Couverture, ou sa version réduite : créée à la première demande, refaite
 * quand la couverture change. `undefined` si la couverture n'existe pas.
 */
export const readCover = async (
    file: string,
    size?: 'small',
): Promise<Buffer | undefined> => {
    const source = await stat(file).catch(() => undefined);
    if (!source) return undefined;
    if (size !== 'small') return readFile(file);

    const small = smallCoverFile(file);
    const cached = await stat(small).catch(() => undefined);
    if (cached && cached.mtimeMs >= source.mtimeMs) return readFile(small);

    // Lue en mémoire : sharp garderait le fichier ouvert (Windows).
    const data = await readImage(await readFile(file))
        .resize({ width: SMALL_WIDTH, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
    // Fichier temporaire puis renommage : deux demandes en même temps ne
    // laissent jamais un fichier à moitié écrit.
    const tmp = `${small}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, small).catch(() => unlink(tmp).catch(() => {}));
    return data;
};
