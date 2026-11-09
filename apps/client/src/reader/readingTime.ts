import { useCallback, useEffect, useRef } from 'react';

import { sendReadingTime } from '@/services/api';

// Sans changer de page pendant plus longtemps : pause, ce temps ne compte pas.
export const IDLE_MS = 2 * 60 * 1000;
// Envoi régulier pendant la lecture.
export const FLUSH_MS = 60 * 1000;
// Plafond d'un envoi (le serveur refuse au-delà).
const MAX_SECONDS = 600;

type Pending = { volumeId: number; ms: number; pages: number };

/**
 * Temps passé dans le lecteur, pour les statistiques : le temps entre deux
 * pages vues compte (sauf pause de plus de 2 min), envoyé chaque minute,
 * au changement de tome et en quittant. Rien en lecture seule (simulation).
 *
 * Renvoie la fonction à appeler à chaque page vue, avec le nombre de pages
 * nouvelles.
 */
export const useReadingTime = (
    volumeId: number | undefined,
    enabled: boolean,
) => {
    const pending = useRef<Pending>(undefined);
    // Dernière page vue (heure), pour le temps passé dessus.
    const last = useRef<number>(undefined);

    /**
     * Envoie le temps accumulé. `close` : on quitte ce tome, le temps sur la
     * dernière page compte ; `beacon` : la page se ferme.
     */
    const flush = useCallback(({ close = false, beacon = false } = {}) => {
        const current = pending.current;
        if (!current) return;
        if (close) {
            if (last.current !== undefined) {
                const idle = Date.now() - last.current;
                if (idle <= IDLE_MS) current.ms += idle;
            }
            last.current = undefined;
            pending.current = undefined;
        } else {
            pending.current = { ...current, ms: 0, pages: 0 };
        }
        if (current.ms < 1000) {
            // Trop peu pour un envoi : gardé pour le suivant.
            if (!close) pending.current = current;
            return;
        }
        const time = {
            seconds: Math.min(MAX_SECONDS, Math.round(current.ms / 1000)),
            pages: current.pages,
        };
        const url = `/api/volumes/${current.volumeId}/reading-time`;
        // Page qui se ferme : sendBeacon part même après la fermeture.
        if (
            beacon &&
            navigator.sendBeacon?.(
                url,
                new Blob([JSON.stringify(time)], {
                    type: 'application/json',
                }),
            )
        ) {
            return;
        }
        sendReadingTime(current.volumeId, time).catch(() => {
            // Sans réseau : ce temps est perdu, la lecture continue.
        });
    }, []);

    const activity = useCallback(
        (newPages: number) => {
            if (!enabled || volumeId === undefined) return;
            if (pending.current?.volumeId !== volumeId) {
                flush({ close: true });
                pending.current = { volumeId, ms: 0, pages: 0 };
            }
            const now = Date.now();
            if (last.current !== undefined && now - last.current <= IDLE_MS) {
                pending.current.ms += now - last.current;
            }
            pending.current.pages += newPages;
            last.current = now;
        },
        [enabled, volumeId, flush],
    );

    useEffect(() => {
        const timer = setInterval(() => flush(), FLUSH_MS);
        const onHide = () => {
            if (document.visibilityState === 'hidden') {
                flush({ close: true, beacon: true });
            }
        };
        document.addEventListener('visibilitychange', onHide);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onHide);
            flush({ close: true, beacon: true });
        };
    }, [flush]);

    return activity;
};
