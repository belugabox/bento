import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import type { PageReader } from './archive/archive';
import type { Db } from './db';
import {
    getSeries,
    getVolume,
    listLibraries,
    listSeries,
} from './library/catalog';
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
}: ApiDeps) =>
    new Hono()
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
            (c) => c.json(listSeries(db, c.req.valid('query'))),
        )
        .get('/series/:id', zValidator('param', idParam), (c) =>
            c.json(getSeries(db, c.req.valid('param').id)),
        )
        .get('/volumes/:id', zValidator('param', idParam), (c) => {
            // Le chemin sur disque reste côté serveur.
            const { fullPath: _fullPath, ...volume } = getVolume(
                db,
                c.req.valid('param').id,
            );
            return c.json(volume);
        })
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
