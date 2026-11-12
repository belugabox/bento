import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import 'dotenv/config';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createApi } from './api';
import { PageReader } from './archive/archive';
import { recoveryLink } from './auth/links';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { syncLibraries } from './library/catalog';
import { SeriesCovers } from './library/covers';
import { LibraryFiles } from './library/files';
import { LibraryScanner } from './library/scanner';
import { SheetRefresher } from './library/sheetRefresh';
import { Bedetheque } from './metadata/bedetheque';
import { MangaNews } from './metadata/mangaNews';
import { Wikipedia } from './metadata/wikipedia';
import { SettingsStore, defaultSettings } from './settings';
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

// Aucun admin ne peut se connecter (pas encore de mot de passe) : un lien
// de secours dans le journal.
const recovery = recoveryLink(database.db);
if (recovery) {
    logger.warn(
        `Aucun admin n'a de mot de passe. Lien pour en choisir un (valable 7 jours) : ${config.PUBLIC_URL}/join/${recovery}`,
    );
}

const scanner = new LibraryScanner(database.db, config.COVERS_PATH, logger);
const pages = new PageReader();
// Réglages de l'admin ; la variable SCAN_INTERVAL_MINUTES donne la valeur
// par défaut de l'intervalle des scans.
const settings = new SettingsStore(
    database.db,
    defaultSettings(config.SCAN_INTERVAL_MINUTES),
);

// Sites de fiches, partagés par l'API et la mise à jour de nuit (pages
// gardées un moment).
const mangaNews = new MangaNews();
const bedetheque = new Bedetheque();
const sheetRefresher = new SheetRefresher(
    database.db,
    { mangaNews, bedetheque },
    settings,
    logger,
);
sheetRefresher.start();

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
            settings,
            wikipedia: new Wikipedia(),
            mangaNews,
            bedetheque,
            sheetRefresher,
            auth: { publicUrl: config.PUBLIC_URL },
        }),
    )
    // Client compilé ; toute autre adresse renvoie l'appli (routage côté client).
    // Fichiers de Vite (empreinte dans le nom) : gardés un an. Les autres
    // (index.html, manifeste, icônes) : revérifiés à chaque fois, pour
    // qu'une nouvelle version arrive tout de suite.
    .use('/*', async (c, next) => {
        await next();
        if (c.res.ok) {
            c.res.headers.set(
                'Cache-Control',
                c.req.path.startsWith('/assets/')
                    ? 'public, max-age=31536000, immutable'
                    : 'no-cache',
            );
        }
    })
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
    // Scan périodique, relancé quand l'admin change l'intervalle.
    let timer: NodeJS.Timeout | undefined;
    const schedule = (minutes: number) => {
        clearInterval(timer);
        timer =
            minutes > 0
                ? setInterval(() => void scanAll(ids), minutes * 60_000).unref()
                : undefined;
    };
    schedule(settings.get().scanIntervalMinutes);
    let interval = settings.get().scanIntervalMinutes;
    settings.onChange(({ scanIntervalMinutes }) => {
        if (scanIntervalMinutes === interval) return;
        interval = scanIntervalMinutes;
        schedule(scanIntervalMinutes);
    });
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
