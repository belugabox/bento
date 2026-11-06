import { randomBytes } from 'node:crypto';
import {
    readFile,
    rename,
    rm,
    stat,
    unlink,
    writeFile,
} from 'node:fs/promises';

import { readImage } from '../archive/image';

// Vignettes des grilles : 360 × 540. Une carte fait 120 à 180 px de large,
// et un téléphone affiche 2 à 3 pixels réels par pixel.
const SMALL_WIDTH = 360;

/**
 * Version réduite d'une couverture, rangée à côté de celle-ci. Sa largeur
 * est dans le nom : en changer refait toutes les vignettes.
 */
export const smallCoverFile = (file: string) =>
    file.replace(/\.webp$/, `.small-${SMALL_WIDTH}.webp`);

/** Ancienne vignette de 200 px, à supprimer. */
const oldSmallCoverFile = (file: string) =>
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
        .webp({ quality: 80 })
        .toBuffer();
    // Fichier temporaire puis renommage : deux demandes en même temps ne
    // laissent jamais un fichier à moitié écrit.
    const tmp = `${small}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, small).catch(() => unlink(tmp).catch(() => {}));
    await rm(oldSmallCoverFile(file), { force: true });
    return data;
};
