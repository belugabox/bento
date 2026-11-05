import sharp from 'sharp';

/**
 * Image lue avec sharp, en tolérant les défauts sans gravité (octets en trop
 * dans un JPEG…), que les liseuses ignorent aussi. Une image tronquée ou
 * illisible reste refusée.
 */
export const readImage = (data: Buffer) => sharp(data, { failOn: 'error' });
