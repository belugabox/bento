import { useSyncExternalStore } from 'react';

/**
 * Réseau disponible ou non : d'après le navigateur, et d'après les appels à
 * l'API (une requête qui n'aboutit pas, alors que le navigateur se croit
 * en ligne : Wi-Fi sans Internet, serveur injoignable).
 */
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
const listeners = new Set<() => void>();

const set = (value: boolean) => {
    if (online === value) return;
    online = value;
    for (const listener of listeners) listener();
};

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => set(true));
    window.addEventListener('offline', () => set(false));
}

/** Appel à l'API sans réponse : hors ligne. */
export const reportNetworkError = () => set(false);
/** Réponse reçue : en ligne. */
export const reportNetworkOk = () => set(true);

export const isOnline = () => online;

/** Suit le réseau (bandeau « Hors ligne », accueil réduit aux téléchargements). */
export const useOnline = () =>
    useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => online,
    );

/** Erreur d'un appel qui n'a pas atteint le serveur. */
export class NetworkError extends Error {
    constructor() {
        super('Pas de réseau');
        this.name = 'NetworkError';
    }
}

/** Lance `call` ; sans réponse du serveur, signale le réseau absent. */
export const reachServer = async <T>(call: () => Promise<T>): Promise<T> => {
    let result: T;
    try {
        result = await call();
    } catch (e) {
        // `fetch` rejette (TypeError) quand rien n'arrive au serveur.
        if (e instanceof TypeError) {
            reportNetworkError();
            throw new NetworkError();
        }
        throw e;
    }
    reportNetworkOk();
    return result;
};
