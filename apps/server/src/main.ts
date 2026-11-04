import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import 'dotenv/config';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createApi } from './api';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { createLogger } from './tools/logger';

// Depuis `src` (dev) comme depuis `dist` (build).
const SERVER_ROOT = path.join(__dirname, '..');
const CLIENT_DIST = path.join(SERVER_ROOT, '../client/dist');

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const { version } = JSON.parse(
    readFileSync(path.join(SERVER_ROOT, 'package.json'), 'utf-8'),
) as { version: string };

process.on('unhandledRejection', (err) => {
    logger.error(err, 'unhandledRejection');
});

const database = openDatabase(config.DB_FILE);
logger.info(`Base de données : ${config.DB_FILE}`);

const app = new Hono()
    .route('/api', createApi({ db: database.db, logger, version }))
    // Client compilé ; toute autre adresse renvoie l'appli (routage côté client).
    .use('/*', serveStatic({ root: path.relative(process.cwd(), CLIENT_DIST) }))
    .get('*', (c) =>
        c.html(readFileSync(path.join(CLIENT_DIST, 'index.html'), 'utf-8')),
    );

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) =>
    logger.info(`Bento ${version} démarré sur http://localhost:${info.port}`),
);

let shuttingDown = false;
const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} reçu, arrêt…`);
    server.close(() => {
        database.close();
        process.exit(0);
    });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
