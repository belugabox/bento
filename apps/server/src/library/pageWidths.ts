// Sans dépendance à Node : partagé avec le client (via `@server/types`).

/**
 * Largeurs auxquelles une page peut être servie réduite (`?w=`), en pixels
 * réels. Peu nombreuses : chaque version réduite est gardée sur disque.
 * Une tablette Android affiche 1200 à 1600 pixels sur son petit côté.
 */
export const PAGE_WIDTHS = [800, 1200, 1600] as const;
export type PageWidth = (typeof PAGE_WIDTHS)[number];

export const isPageWidth = (value: number): value is PageWidth =>
    (PAGE_WIDTHS as readonly number[]).includes(value);

/**
 * Largeur à demander pour un écran : la plus petite qui couvre son petit
 * côté en pixels réels (une page en hauteur, ou la moitié d'une double
 * page en largeur) ; `undefined` au-delà (page d'origine).
 */
export const pageWidthFor = (screen: {
    width: number;
    height: number;
    pixelRatio: number;
}): PageWidth | undefined => {
    const needed =
        Math.min(screen.width, screen.height) * (screen.pixelRatio || 1);
    return PAGE_WIDTHS.find((width) => width >= needed);
};
