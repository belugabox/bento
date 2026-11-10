import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type Plugin, defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Fichiers de `public/` gardés aussi sur l'appareil (manifeste, icônes).
const PUBLIC_FILES = [
    '/manifest.webmanifest',
    '/icon.svg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png',
];

/**
 * Service worker (`sw/sw.js`), écrit au build avec la liste de tous les
 * fichiers de l'application (même ceux chargés à la demande, comme le
 * lecteur) et une version qui change avec eux : un nouveau build installe
 * un nouveau service worker.
 */
const serviceWorker = (): Plugin => ({
    name: 'bento-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
        const files = Object.keys(bundle)
            .filter((name) => !name.endsWith('.map') && !name.startsWith('.'))
            .map((name) => (name === 'index.html' ? '/' : `/${name}`))
            .sort();
        const assets = [...files, ...PUBLIC_FILES];
        const version = createHash('sha256')
            .update(assets.join('\n'))
            .digest('hex')
            .slice(0, 12);
        const source = readFileSync(
            new URL('./sw/sw.js', import.meta.url),
            'utf-8',
        )
            .replace('__VERSION__', version)
            .replace('__ASSETS__', JSON.stringify(assets));
        this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
});

export default defineConfig({
    plugins: [tsconfigPaths(), react(), serviceWorker()],
    resolve: {
        alias: {
            // N'importer que les icônes utilisées (pas un chunk par icône).
            '@tabler/icons-react':
                '@tabler/icons-react/dist/esm/icons/index.mjs',
        },
    },
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            '/api': 'http://localhost:3001',
        },
    },
});
