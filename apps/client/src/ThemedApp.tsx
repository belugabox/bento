import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { useEffect, useMemo } from 'react';
import { BrowserRouter } from 'react-router';

import { App } from './App';
import { useAppearance, useDefaultAppearance } from './components/theme';
import { fetchAppearance } from './services/api';

/** Thème de l'appli : couleur d'accent et mode (clair, sombre, système). */
export const ThemedApp = () => {
    const { accent, resolved } = useAppearance();
    const [, setDefaults] = useDefaultAppearance();
    // Thème de l'admin, gardé sur l'appareil pour le prochain lancement.
    useEffect(() => {
        fetchAppearance()
            .then(setDefaults)
            .catch(() => {
                // Hors ligne : le thème déjà connu reste.
            });
    }, [setDefaults]);
    // Barres du système (Android) : du fond de l'appli, discrètes.
    useEffect(() => {
        document
            .querySelector('meta[name="theme-color"]')
            ?.setAttribute(
                'content',
                resolved === 'dark' ? '#242424' : '#ffffff',
            );
    }, [resolved]);
    const theme = useMemo(
        () => createTheme({ primaryColor: accent }),
        [accent],
    );
    return (
        <MantineProvider theme={theme} forceColorScheme={resolved}>
            <Notifications position="bottom-center" />
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </MantineProvider>
    );
};
