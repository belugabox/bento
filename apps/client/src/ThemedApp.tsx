import { MantineProvider, createTheme } from '@mantine/core';
import { useMemo } from 'react';
import { BrowserRouter } from 'react-router';

import { App } from './App';
import { useAccent } from './components/theme';

/** Thème de l'appli : couleur d'accent et mode (clair, sombre, système). */
export const ThemedApp = () => {
    const [accent] = useAccent();
    const theme = useMemo(
        () => createTheme({ primaryColor: accent }),
        [accent],
    );
    return (
        // Mode gardé par Mantine sur l'appareil ; sombre par défaut.
        <MantineProvider theme={theme} defaultColorScheme="dark">
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </MantineProvider>
    );
};
