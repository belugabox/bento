import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [tsconfigPaths(), react()],
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
