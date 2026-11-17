import { useMediaQuery } from '@mantine/hooks';
import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** Pages principales : l'accueil, la bibliothèque, et « Moi ». */
export const NAV_ITEMS = [
    { to: '/', label: 'Accueil' },
    { to: '/library', label: 'Bibliothèque' },
    { to: '/me', label: 'Moi' },
] as const;

export type NavSection = (typeof NAV_ITEMS)[number]['to'];

// Pages ouvertes depuis « Moi » : son onglet reste allumé.
const ME_PAGES = [
    '/me',
    '/account',
    '/downloads',
    '/manage',
    '/drafts',
    '/stats',
    '/users',
    '/settings',
];

/** Onglet d'une page : la fiche d'une série est dans la bibliothèque. */
export const navSection = (pathname: string): NavSection | null => {
    // « Pour toi » en entier : depuis l'accueil.
    if (pathname === '/' || pathname === '/for-you') return '/';
    if (pathname.startsWith('/library') || /^\/series\/\d+$/.test(pathname)) {
        return '/library';
    }
    if (
        ME_PAGES.some(
            (page) => pathname === page || pathname.startsWith(`${page}/`),
        )
    ) {
        return '/me';
    }
    return null;
};

// Écran étroit ou tactile (téléphone, tablette) : onglets en bas, au pouce.
const BOTTOM_NAV_QUERY = '(max-width: 62em), (pointer: coarse)';

/** Barre d'onglets en bas (téléphone, tablette) plutôt que l'en-tête. */
export const useBottomNav = () =>
    useMediaQuery(BOTTOM_NAV_QUERY, false, {
        getInitialValueInEffect: false,
    });

/** Hauteur de la barre d'onglets, sans la marge du bas de l'écran. */
export const BOTTOM_NAV_HEIGHT = 60;

// Dernière page parcourue : l'accueil, ou la bibliothèque avec ses filtres.
let browsePage = '/library';

/** Garde la page parcourue (dans la mise en page, à chaque page). */
export const useBrowsePage = () => {
    const { pathname, search } = useLocation();
    useEffect(() => {
        if (pathname === '/') browsePage = '/';
        else if (pathname === '/library') browsePage = `/library${search}`;
    }, [pathname, search]);
};

/**
 * Retour de la fiche d'une série : là d'où on l'a ouverte (l'accueil, ou la
 * bibliothèque avec ses filtres et son tri).
 */
export const browseBackLink = () =>
    browsePage === '/'
        ? { to: '/', label: 'Retour à l’accueil' }
        : { to: browsePage, label: 'Retour à la bibliothèque' };
