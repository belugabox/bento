import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ThemedApp } from './ThemedApp';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemedApp />
    </StrictMode>,
);
