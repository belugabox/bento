import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router';

// Position dans la page de chaque passage (clé de l'historique), le temps
// de l'onglet.
const scrollPositions = new Map<string, number>();

/**
 * Garde la position dans la page en partant, et la rend au retour arrière
 * (même entrée de l'historique) dès que le contenu est là.
 */
export const useScrollMemory = (ready: boolean) => {
    const { key } = useLocation();
    const restored = useRef(false);
    useLayoutEffect(() => {
        if (!ready || restored.current) return;
        restored.current = true;
        const saved = scrollPositions.get(key);
        if (saved) window.scrollTo(0, saved);
    }, [ready, key]);
    useEffect(
        () => () => {
            scrollPositions.set(key, window.scrollY);
        },
        [key],
    );
};
