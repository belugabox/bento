import { hc } from 'hono/client';

import type { ApiType } from '@server/types';

/** Client typé de l'API (`/api`, servie par le même domaine). */
export const api = hc<ApiType>('/api');

/** Résultat JSON d'un appel, ou erreur avec le message renvoyé par le serveur. */
export const json = async <T>(
    call: Promise<{ ok: boolean; status: number; json(): Promise<T> }>,
): Promise<T> => {
    const response = await call;
    if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
            message?: string;
        };
        throw new Error(body.message ?? `Erreur ${response.status}`);
    }
    return response.json();
};
