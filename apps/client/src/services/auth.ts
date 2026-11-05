import { createContext, useContext } from 'react';

import { api, json } from './api';

export type CurrentUser = Awaited<ReturnType<typeof fetchMe>>;

export const fetchMe = () => json(api.me.$get());

/** Ferme la session Bento, puis celle de Pocket ID si possible. */
export const logout = async () => {
    const { logoutUrl } = await json(api.auth.logout.$post());
    window.location.assign(logoutUrl ?? '/');
};

export const UserContext = createContext<CurrentUser | undefined>(undefined);

/** Personne connectée (disponible sous `RequireUser`). */
export const useCurrentUser = () => {
    const user = useContext(UserContext);
    if (!user) throw new Error('useCurrentUser hors de RequireUser');
    return user;
};
