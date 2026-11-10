import { createContext, useContext } from 'react';

import { api, json } from './api';

export type CurrentUser = Awaited<ReturnType<typeof fetchMe>>;

export const fetchMe = () => json(api.me.$get());

// Dernière personne connectée sur l'appareil : pour ouvrir Bento sans réseau.
const SAVED_USER = 'bento:user';

/**
 * Garde la personne connectée sur l'appareil ; pas une vue simulée par
 * l'admin (« Voir comme un lecteur »).
 */
export const saveUser = (user: CurrentUser) => {
    if (user.preview) return;
    try {
        localStorage.setItem(SAVED_USER, JSON.stringify(user));
    } catch {
        // Stockage refusé : pas d'ouverture hors ligne.
    }
};

export const savedUser = (): CurrentUser | undefined => {
    try {
        const saved = localStorage.getItem(SAVED_USER);
        return saved ? (JSON.parse(saved) as CurrentUser) : undefined;
    } catch {
        return undefined;
    }
};

export const forgetSavedUser = () => {
    try {
        localStorage.removeItem(SAVED_USER);
    } catch {
        // Rien de gardé.
    }
};

/**
 * Ferme la session, oublie la personne sur l'appareil (et ses tomes
 * téléchargés), puis revient à la page de connexion.
 */
export const logout = async () => {
    await json(api.auth.logout.$post());
    forgetSavedUser();
    await onLogout();
    window.location.assign('/login');
};

// Nettoyage des données de l'appareil à la déconnexion (téléchargements).
let onLogout: () => Promise<unknown> = async () => {};
export const setLogoutCleanup = (cleanup: () => Promise<unknown>) => {
    onLogout = cleanup;
};

export const UserContext = createContext<CurrentUser | undefined>(undefined);

/** Relit la personne connectée (après un changement de son compte). */
export const RefreshUserContext = createContext<() => Promise<void>>(
    async () => {},
);

export const useRefreshUser = () => useContext(RefreshUserContext);

/** Personne connectée (disponible sous `RequireUser`). */
/**
 * Simulation d'un compte par l'admin : tout est en lecture seule (le
 * serveur refuse les modifications). Faux hors session.
 */
export const useReadOnly = () =>
    Boolean(useContext(UserContext)?.preview?.user);

export const useCurrentUser = () => {
    const user = useContext(UserContext);
    if (!user) throw new Error('useCurrentUser hors de RequireUser');
    return user;
};
