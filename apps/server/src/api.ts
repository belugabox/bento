import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Db } from './db';
import { AppError } from './tools/errors';
import type { Logger } from './tools/logger';

export type ApiDeps = {
    db: Db;
    logger: Logger;
    version: string;
};

/** Routes de l'API, montées sous `/api`. */
export const createApi = ({ db, logger, version }: ApiDeps) =>
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
        });

export type ApiType = ReturnType<typeof createApi>;
