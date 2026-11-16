import { useEffect } from 'react';

/**
 * Sans rien toucher pendant ce délai, l'écran peut de nouveau s'éteindre :
 * une tablette oubliée sur le lecteur ne reste pas allumée toute la nuit.
 */
export const WAKE_IDLE_MS = 10 * 60_000;

// Gestes qui comptent comme de la lecture.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'scroll'] as const;

/**
 * Garde l'écran allumé pendant la lecture (sans quoi une tablette se met en
 * veille au milieu d'une page dense). Le navigateur rend la main quand
 * l'onglet est caché : redemandé au retour. Sans prise en charge (navigateur
 * ancien, adresse non sécurisée), rien.
 */
export const useWakeLock = () => {
    useEffect(() => {
        if (!('wakeLock' in navigator)) return;
        let sentinel: WakeLockSentinel | null = null;
        let requesting = false;
        let disposed = false;
        let idle: ReturnType<typeof setTimeout> | undefined;

        const acquire = async () => {
            if (
                sentinel ||
                requesting ||
                document.visibilityState !== 'visible'
            )
                return;
            requesting = true;
            try {
                const lock = await navigator.wakeLock.request('screen');
                if (disposed) {
                    void lock.release();
                    return;
                }
                sentinel = lock;
                lock.addEventListener('release', () => {
                    if (sentinel === lock) sentinel = null;
                });
            } catch {
                // Refusé (batterie faible, onglet caché) : le prochain geste
                // réessaiera.
            } finally {
                requesting = false;
            }
        };
        const release = () => {
            void sentinel?.release();
            sentinel = null;
        };
        const activity = () => {
            void acquire();
            clearTimeout(idle);
            idle = setTimeout(release, WAKE_IDLE_MS);
        };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') activity();
        };

        activity();
        for (const type of ACTIVITY_EVENTS) {
            window.addEventListener(type, activity, {
                capture: true,
                passive: true,
            });
        }
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            disposed = true;
            clearTimeout(idle);
            release();
            for (const type of ACTIVITY_EVENTS) {
                window.removeEventListener(type, activity, { capture: true });
            }
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);
};
