import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import 'dotenv/config';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createApi } from './api';
import { PageReader } from './archive/archive';
import { OidcClient } from './auth/oidc';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { syncLibraries } from './library/catalog';
import { SeriesCovers } from './library/covers';
import { LibraryFiles } from './library/files';
import { LibraryScanner } from './library/scanner';
import { Wikipedia } from './metadata/wikipedia';
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

const scanner = new LibraryScanner(database.db, config.COVERS_PATH, logger);
const pages = new PageReader();

/** Scanne les bibliothèques l'une après l'autre. */
const scanAll = async (libraryIds: number[]) => {
    for (const id of libraryIds) {
        await scanner
            .scan(id)
            .catch((err) => logger.error(err, `Scan de la bibliothèque ${id}`));
    }
};

const app = new Hono()
    .route(
        '/api',
        createApi({
            db: database.db,
            logger,
            version,
            scanner,
            pages,
            coversPath: config.COVERS_PATH,
            files: new LibraryFiles(
                database.db,
                scanner,
                pages,
                config.COVERS_PATH,
                logger,
            ),
            covers: new SeriesCovers(database.db, pages, config.COVERS_PATH),
            wikipedia: new Wikipedia(),
            auth: {
                oidc: new OidcClient({
                    issuer: config.OIDC_ISSUER,
                    clientId: config.OIDC_CLIENT_ID,
                    clientSecret: config.OIDC_CLIENT_SECRET,
                    redirectUri: `${config.PUBLIC_URL}/api/auth/callback`,
                }),
                publicUrl: config.PUBLIC_URL,
                adminGroup: config.OIDC_ADMIN_GROUP,
                readerGroup: config.OIDC_READER_GROUP,
            },
        }),
    )
    // Client compilé ; toute autre adresse renvoie l'appli (routage côté client).
    .use('/*', serveStatic({ root: path.relative(process.cwd(), CLIENT_DIST) }))
    .get('*', (c) =>
        c.html(readFileSync(path.join(CLIENT_DIST, 'index.html'), 'utf-8')),
    );

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) =>
    logger.info(`Bento ${version} démarré sur http://localhost:${info.port}`),
);

// Bibliothèques de la configuration, scannées au démarrage puis à intervalle.
void (async () => {
    const synced = await syncLibraries(
        database.db,
        config.LIBRARIES,
        config.COVERS_PATH,
    );
    if (synced.length === 0) {
        logger.warn('Aucune bibliothèque configurée (variable LIBRARIES)');
        return;
    }
    const ids = synced.map((library) => library.id);
    await scanAll(ids);
    if (config.SCAN_INTERVAL_MINUTES > 0) {
        setInterval(
            () => void scanAll(ids),
            config.SCAN_INTERVAL_MINUTES * 60_000,
        ).unref();
    }
})().catch((err) => logger.error(err, 'Initialisation des bibliothèques'));

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
