import { Hono } from 'hono';

import type { AuthEnv } from './auth/routes';
import type { Db } from './db';
import { neverOpenedGems } from './library/rankings';

/**
 * Suggestions (`/suggestions`), pour chacun. Les autres (même genre, même
 * auteur, « Pour toi ») se calculent sur l'appareil, d'après la liste des
 * séries.
 */
export const createSuggestionRoutes = (db: Db) =>
    new Hono<AuthEnv>()
        // Bien notées, jamais ouvertes par personne de la famille.
        .get('/gems', (c) => c.json(neverOpenedGems(db, c.var.user)));
