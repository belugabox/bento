import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import type { PageReader } from './archive/archive';
import {
    type AuthDeps,
    type AuthEnv,
    createAuthRoutes,
    requireAdmin,
    requireUser,
} from './auth/routes';
import type { Db } from './db';
import {
    getSeries,
    getVolume,
    listLibraries,
    listSeries,
} from './library/catalog';
import { getProgress, listInProgress, saveProgress } from './library/progress';
import { type LibraryScanner, coverFile } from './library/scanner';
import { AppError, notFound } from './tools/errors';
import type { Logger } from './tools/logger';
import { zValidator } from './tools/validator';

export type ApiDeps = {
    db: Db;
    logger: Logger;
    version: string;
    scanner: LibraryScanner;
    pages: PageReader;
    coversPath: string;
    auth: Omit<AuthDeps, 'db' | 'logger'>;
};

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** Routes de l'API, montées sous `/api`. */
export const createApi = ({
    db,
    logger,
    version,
    scanner,
    pages,
    coversPath,
    auth,
}: ApiDeps) =>
    new Hono<AuthEnv>()
        .onError((err, c) => {
            const route = `${c.req.method} ${c.req.path}`;
            // Erreur métier attendue : message destiné à l'utilisateur.
            if (err instanceof AppError) {
                logger.warn(`${route} → ${err.status}: ${err.message}`);
                return c.json(
                    { name: err.name, message: err.message },
                    err.status,
                );
            }
            // Erreur interne : aucun détail renvoyé au client, tout dans les logs.
            logger.error(err, `${route} failed`);
            return c.json(
                { name: 'Error', message: 'Erreur interne du serveur' },
                500,
            );
        })
        // Public : utilisé par le HEALTHCHECK Docker.
        .get('/health', (c) => {
            db.run(sql`select 1`);
            return c.json({ status: 'ok' as const, version });
        })
        .route('/auth', createAuthRoutes({ db, logger, ...auth }))
        // Tout ce qui suit exige une session.
        .use('*', requireUser(db))
        .get('/me', (c) => c.json(c.var.user))
        .get('/libraries', (c) =>
            c.json(
                listLibraries(db).map((library) => ({
                    ...library,
                    scanning: scanner.isScanning(library.id),
                })),
            ),
        )
        .post(
            '/libraries/:id/scan',
            requireAdmin,
            zValidator('param', idParam),
            async (c) => {
                const { id } = c.req.valid('param');
                if (!listLibraries(db).some((library) => library.id === id)) {
                    throw notFound('Bibliothèque introuvable');
                }
                return c.json(await scanner.scan(id));
            },
        )
        .get(
            '/series',
            zValidator(
                'query',
                z.object({
                    libraryId: z.coerce.number().int().positive().optional(),
                    search: z.string().optional(),
                }),
            ),
            (c) => c.json(listSeries(db, c.var.user.id, c.req.valid('query'))),
        )
        .get('/series/:id', zValidator('param', idParam), (c) =>
            c.json(getSeries(db, c.var.user.id, c.req.valid('param').id)),
        )
        .get('/volumes/:id', zValidator('param', idParam), (c) => {
            // Le chemin sur disque reste côté serveur.
            const { fullPath: _fullPath, ...volume } = getVolume(
                db,
                c.req.valid('param').id,
            );
            return c.json({
                ...volume,
                progress: getProgress(db, c.var.user.id, volume.id),
            });
        })
        .put(
            '/volumes/:id/progress',
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    page: z.number().int().min(0).optional(),
                    completed: z.boolean().optional(),
                }),
            ),
            (c) =>
                c.json({
                    progress: saveProgress(
                        db,
                        c.var.user.id,
                        c.req.valid('param').id,
                        c.req.valid('json'),
                    ),
                }),
        )
        // Tomes commencés, pour « Reprendre la lecture ».
        .get('/continue', (c) => c.json(listInProgress(db, c.var.user.id)))
        .get('/volumes/:id/cover', zValidator('param', idParam), async (c) => {
            const { id } = c.req.valid('param');
            const cover = await readFile(coverFile(coversPath, id)).catch(
                () => {
                    throw notFound('Couverture introuvable');
                },
            );
            return c.body(new Uint8Array(cover), 200, {
                'Content-Type': 'image/webp',
                'Cache-Control': 'private, max-age=3600',
            });
        })
        .get(
            '/volumes/:id/pages/:index',
            zValidator(
                'param',
                idParam.extend({ index: z.coerce.number().int().min(0) }),
            ),
            async (c) => {
                const { id, index } = c.req.valid('param');
                const { data, type } = await pages.page(
                    getVolume(db, id).fullPath,
                    index,
                );
                return c.body(new Uint8Array(data), 200, {
                    'Content-Type': type,
                    'Cache-Control': 'private, max-age=3600',
                });
            },
        );

export type ApiType = ReturnType<typeof createApi>;
