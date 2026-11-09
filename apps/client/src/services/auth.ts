import { createContext, useContext } from 'react';

import { api, json } from './api';

export type CurrentUser = Awaited<ReturnType<typeof fetchMe>>;

export const fetchMe = () => json(api.me.$get());

/** Ferme la session, puis revient à la page de connexion. */
export const logout = async () => {
    await json(api.auth.logout.$post());
    window.location.assign('/login');
};

export const UserContext = createContext<CurrentUser | undefined>(undefined);

/** Relit la personne connectée (après un changement de son compte). */
export const RefreshUserContext = createContext<() => Promise<void>>(
    async () => {},
);

export const useRefreshUser = () => useContext(RefreshUserContext);

/** Personne connectée (disponible sous `RequireUser`). */
export const useCurrentUser = () => {
    const user = useContext(UserContext);
    if (!user) throw new Error('useCurrentUser hors de RequireUser');
    return user;
};
