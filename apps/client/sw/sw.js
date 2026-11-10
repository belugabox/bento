// Service worker de Bento, généré au build (`vite.config.ts`, plugin
// `serviceWorker`) : les deux marques de VERSION et ASSETS ci-dessous y sont
// remplacées par la version et la liste des fichiers de l'application.
//
// - Application (scripts, styles, icônes, index.html) gardée sur l'appareil :
//   Bento s'ouvre sans réseau.
// - Pages et couvertures des tomes téléchargés (cache `bento-downloads`,
//   rempli par l'application) : servies depuis l'appareil, réseau ou pas.
// - Le reste de l'API passe par le réseau : l'application gère son absence.

const VERSION = '__VERSION__';
const ASSETS = __ASSETS__;
const APP_CACHE = `bento-app-${VERSION}`;
const DOWNLOADS = 'bento-downloads';
// Page demandée : le réseau d'abord, l'appareil s'il ne répond pas assez vite.
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(APP_CACHE)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // Garde la version précédente : une page encore ouverte avec
            // l'ancienne application peut y charger ses fichiers.
            const names = (await caches.keys()).filter(
                (name) => name.startsWith('bento-app-') && name !== APP_CACHE,
            );
            for (const name of names.slice(0, -1)) await caches.delete(name);
            await self.clients.claim();
        })(),
    );
});

/** Page ou couverture d'un tome : celle téléchargée, s'il y en a une. */
const DOWNLOADABLE = /^\/api\/volumes\/\d+\/(pages\/\d+|cover)$/;

const fromDownloads = async (request) => {
    const cache = await caches.open(DOWNLOADS);
    // Largeur et version dans l'adresse : le fichier téléchargé convient.
    const saved = await cache.match(request, { ignoreSearch: true });
    return saved ?? fetch(request);
};

const withTimeout = (promise, ms) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('lent')), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });

const navigate = async (request) => {
    try {
        return await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    } catch {
        const cache = await caches.open(APP_CACHE);
        return (await cache.match('/')) ?? Response.error();
    }
};

const appFile = async (request) => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
        const cache = await caches.open(APP_CACHE);
        await cache.put(request, response.clone());
    }
    return response;
};

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (DOWNLOADABLE.test(url.pathname)) {
        event.respondWith(fromDownloads(request));
    } else if (url.pathname.startsWith('/api/')) {
        // Réseau seulement : l'application sait faire sans.
    } else if (request.mode === 'navigate') {
        event.respondWith(navigate(request));
    } else {
        event.respondWith(appFile(request));
    }
});
