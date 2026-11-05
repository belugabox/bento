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

/** Tiers de l'écran touché : gauche et droite tournent, le milieu affiche la barre. */
export const sideOfTap = (x: number, width: number) =>
    x < width / 3 ? 'left' : x > (width * 2) / 3 ? 'right' : 'middle';

// Déplacement horizontal minimal (px) pour qu'un geste soit un balayage.
const SWIPE_MIN = 50;

/**
 * Déplacement pour un balayage : pousser la page vers la gauche revient à
 * toucher le côté droit (page suivante de gauche à droite).
 */
export const moveForSwipe = (
    dx: number,
    dy: number,
    direction: Direction,
): Move | undefined => {
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) {
        return undefined;
    }
    return moveForSide(dx < 0 ? 'right' : 'left', direction);
};

/** Pages affichées ensemble : une seule, ou deux en double page. */
export type Spread = number[];

/** Une page par écran. */
export const singleSpreads = (pageCount: number): Spread[] =>
    Array.from({ length: pageCount }, (_, page) => [page]);

/**
 * Doubles pages : la couverture seule, puis les pages par deux. Une page
 * plus large que haute (double page déjà fusionnée) reste seule, et la
 * page qui la précède aussi.
 */
export const doubleSpreads = (sizes: [number, number][]): Spread[] => {
    if (sizes.length === 0) return [];
    const wide = (page: number) => {
        const [width, height] = sizes[page]!;
        return width > height;
    };
    const spreads: Spread[] = [[0]];
    let page = 1;
    while (page < sizes.length) {
        if (!wide(page) && page + 1 < sizes.length && !wide(page + 1)) {
            spreads.push([page, page + 1]);
            page += 2;
        } else {
            spreads.push([page]);
            page += 1;
        }
    }
    return spreads;
};

/** Index de l'écran qui contient la page. */
export const spreadIndexOf = (spreads: Spread[], page: number) =>
    Math.max(
        spreads.findIndex((spread) => spread.includes(page)),
        0,
    );
