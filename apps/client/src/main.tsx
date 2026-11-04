import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App';

const theme = createTheme({
    primaryColor: 'teal',
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <MantineProvider theme={theme} defaultColorScheme="dark">
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </MantineProvider>
    </StrictMode>,
);
