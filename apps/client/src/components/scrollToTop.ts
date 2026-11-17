import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * Une page qu'on ouvre (lien, onglet du bas) commence en haut : sans cela,
 * la fenêtre garde le défilement de la page quittée (signalé : la
 * bibliothèque ouverte à mi-hauteur depuis l'accueil). Le retour arrière
 * garde sa position (`useScrollMemory`), et une même page qui change son
 * adresse (filtres, recherche) ne remonte pas.
 */
export const useScrollToTop = () => {
    const { key, pathname } = useLocation();
    const type = useNavigationType();
    const previous = useRef(pathname);
    useLayoutEffect(() => {
        const samePage = previous.current === pathname;
        previous.current = pathname;
        if (type === 'POP') return;
        if (type === 'REPLACE' && samePage) return;
        window.scrollTo(0, 0);
        // Seulement quand l'entrée de l'historique change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
};
