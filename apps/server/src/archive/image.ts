import sharp from 'sharp';

/**
 * Image lue avec sharp, en tolérant les défauts sans gravité (octets en trop
 * dans un JPEG…), que les liseuses ignorent aussi. Une image tronquée ou
 * illisible reste refusée.
 */
export const readImage = (data: Buffer) => sharp(data, { failOn: 'error' });

/**
 * Format d'une couverture (2:3), recadrée depuis le haut : une page très
 * haute (webtoon) ne donne pas une vignette interminable. 600 px : nette
 * sur la fiche d'une série, même sur un écran à haute densité.
 */
export const COVER_SIZE = {
    width: 600,
    height: 900,
    fit: 'cover',
    position: 'top',
} as const;

export const COVER_QUALITY = 85;
