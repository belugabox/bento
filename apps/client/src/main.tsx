import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ThemedApp } from './ThemedApp';

// Service worker (build seulement) : Bento s'ouvre sans réseau, et sert les
// tomes téléchargés depuis l'appareil.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // Pas de service worker (navigation privée…) : en ligne seulement.
        });
    });
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemedApp />
    </StrictMode>,
);
