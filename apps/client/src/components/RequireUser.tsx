import { Center, Loader } from '@mantine/core';
import { type ReactNode, useEffect, useState } from 'react';

import { type CurrentUser, UserContext, fetchMe } from '@/services/auth';

/**
 * N'affiche son contenu qu'une fois la personne connue ; sans session,
 * `json` envoie vers la connexion Pocket ID.
 */
export const RequireUser = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<CurrentUser>();
    const [error, setError] = useState<string>();

    useEffect(() => {
        fetchMe()
            .then(setUser)
            .catch((e: Error) => setError(e.message));
    }, []);

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
    return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
};
