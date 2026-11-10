import { Center, Loader } from '@mantine/core';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { keepOnlyDownloadsOf } from '@/offline/downloads';
import { flushQueue } from '@/offline/syncQueue';
import {
    type CurrentUser,
    RefreshUserContext,
    UserContext,
    fetchMe,
    saveUser,
    savedUser,
} from '@/services/auth';
import { NetworkError, useOnline } from '@/services/network';

/**
 * N'affiche son contenu qu'une fois la personne connue ; sans session,
 * `json` envoie vers la page de connexion. Sans réseau, la dernière personne
 * connue sur l'appareil (lecture de ses tomes téléchargés).
 */
export const RequireUser = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<CurrentUser>();
    const [error, setError] = useState<string>();

    const refresh = useCallback(
        () =>
            fetchMe().then((me) => {
                saveUser(me);
                // Tomes téléchargés par un autre compte : effacés.
                if (!me.preview) void keepOnlyDownloadsOf(me.id);
                setUser(me);
            }),
        [],
    );

    useEffect(() => {
        refresh().catch((e: Error) => {
            const saved = e instanceof NetworkError ? savedUser() : undefined;
            if (saved) setUser(saved);
            else setError(e.message);
        });
    }, [refresh]);

    // Lecture faite sans réseau : envoyée au retour du réseau (et à
    // l'ouverture, si elle attendait).
    const online = useOnline();
    useEffect(() => {
        if (online && user && !user.preview) void flushQueue(user.id);
    }, [online, user]);

    if (error) {
        return <Center h="100dvh">{error}</Center>;
    }
    if (!user) {
        return (
            <Center h="100dvh">
                <Loader />
            </Center>
        );
    }
    return (
        <RefreshUserContext.Provider value={refresh}>
            <UserContext.Provider value={user}>{children}</UserContext.Provider>
        </RefreshUserContext.Provider>
    );
};
