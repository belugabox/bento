import { z } from 'zod';

/** Identifiant numérique dans l'adresse (`/series/:id`). */
export const idParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * Cache d'une image de la bibliothèque. Avec sa version dans l'adresse
 * (`?v=`), elle ne change jamais : le navigateur la garde un an.
 */
export const imageCache = (version?: string) =>
    version ? 'private, max-age=31536000, immutable' : 'private, max-age=3600';
