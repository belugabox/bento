import { Hono } from 'hono';
import { z } from 'zod';

import { type AuthEnv, requireAdmin } from './auth/routes';
import type { Db } from './db';
import type { LibraryFiles } from './library/files';
import { libraryStats } from './library/libraryStats';
import { readingRankings } from './library/rankings';
import {
    STATS_PERIODS,
    readerStats,
    readingOverview,
} from './library/readingStats';
import { getStats } from './library/stats';
import { zValidator } from './tools/validator';

// Période des statistiques et décalage horaire de l'appareil (minutes).
const statsQuery = z.object({
    period: z.enum(STATS_PERIODS).default('30d'),
    tz: z.coerce.number().int().min(-840).max(840).default(0),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * Statistiques (`/stats`), à part de `api.ts` : la chaîne de routes de
 * Hono y devenait trop longue pour TypeScript.
 */
export const createStatsRoutes = (db: Db, files: LibraryFiles) =>
    new Hono<AuthEnv>()
        // Chiffres de la bibliothèque et de la lecture (admin).
        .get('/', requireAdmin, async (c) =>
            c.json({
                ...getStats(db),
                pendingDrafts: await files.pendingSeries(),
            }),
        )
        // Lecture sur une période : activité par jour, moments, lecteurs.
        .get('/reading', requireAdmin, zValidator('query', statsQuery), (c) =>
            c.json(readingOverview(db, c.req.valid('query'))),
        )
        // La bibliothèque en chiffres : croissance, répartitions, séries
        // jamais ouvertes.
        .get('/library', requireAdmin, (c) => c.json(libraryStats(db)))
        // Classements : séries les plus lues, notes face à la lecture.
        .get('/rankings', requireAdmin, zValidator('query', statsQuery), (c) =>
            c.json(readingRankings(db, c.req.valid('query'))),
        )
        // Fiche d'un lecteur.
        .get(
            '/readers/:id',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('query', statsQuery),
            (c) =>
                c.json(
                    readerStats(
                        db,
                        c.req.valid('param').id,
                        c.req.valid('query'),
                    ),
                ),
        );
