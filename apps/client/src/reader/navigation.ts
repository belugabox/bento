/** Sens de lecture : de droite à gauche (manga) ou de gauche à droite (BD). */
export type Direction = 'rtl' | 'ltr';

/** Ajustement de la page à l'écran. */
export type Fit = 'screen' | 'width' | 'height';

export type Move = 'next' | 'previous';

/**
 * Déplacement pour un côté de l'écran (zone cliquée ou flèche du clavier).
 * En manga, la page suivante est à gauche.
 */
export const moveForSide = (
    side: 'left' | 'right',
    direction: Direction,
): Move => ((side === 'left') === (direction === 'rtl') ? 'next' : 'previous');

/** Déplacement pour une touche du clavier, ou `undefined` si elle n'en fait pas. */
export const moveForKey = (
    key: string,
    direction: Direction,
): Move | undefined => {
    switch (key) {
        case 'ArrowLeft':
            return moveForSide('left', direction);
        case 'ArrowRight':
            return moveForSide('right', direction);
        // Espace et Page suivante avancent toujours, quel que soit le sens.
        case ' ':
        case 'PageDown':
            return 'next';
        case 'PageUp':
            return 'previous';
        default:
            return undefined;
    }
};

/** Page (index à partir de 0) bornée au tome. */
export const clampPage = (page: number, pageCount: number) =>
    Math.min(Math.max(Math.trunc(page) || 0, 0), Math.max(pageCount - 1, 0));

/** Index des pages à précharger autour de la page affichée. */
export const pagesToPreload = (
    page: number,
    pageCount: number,
    { ahead = 3, behind = 1 } = {},
) => {
    const pages: number[] = [];
    for (let i = 1; i <= ahead; i++) pages.push(page + i);
    for (let i = 1; i <= behind; i++) pages.push(page - i);
    return pages.filter((p) => p >= 0 && p < pageCount);
};
