import { Center, Loader } from '@mantine/core';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import {
    type CurrentUser,
    RefreshUserContext,
    UserContext,
    fetchMe,
} from '@/services/auth';

/**
 * N'affiche son contenu qu'une fois la personne connue ; sans session,
 * `json` envoie vers la page de connexion.
 */
export const RequireUser = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<CurrentUser>();
    const [error, setError] = useState<string>();

    const refresh = useCallback(() => fetchMe().then(setUser), []);

    useEffect(() => {
        refresh().catch((e: Error) => setError(e.message));
    }, [refresh]);

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
