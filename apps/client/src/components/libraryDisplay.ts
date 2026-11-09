import { useLocalStorage } from '@mantine/hooks';

export type LibraryLayout = 'grid' | 'list';

/** Affichage des séries et des tomes, propre à l'appareil. */
export type LibraryDisplay = {
    layout: LibraryLayout;
    /** Cran de la glissière, des plus petites cartes aux plus grandes. */
    size: number;
    /** Grille de couvertures, sans titre dessous. */
    coversOnly: boolean;
};

export const DEFAULT_DISPLAY: LibraryDisplay = {
    layout: 'grid',
    size: 2,
    coversOnly: false,
};

export const LAYOUT_OPTIONS: { value: LibraryLayout; label: string }[] = [
    { value: 'grid', label: 'Grille' },
    { value: 'list', label: 'Liste' },
];

/**
 * Tailles des cartes, une par cran de la glissière : son nom, et les
 * colonnes de la grille selon la largeur de l'écran.
 */
export const CARD_SIZES: {
    label: string;
    columns: { base: number; xs: number; sm: number; md: number; lg: number };
}[] = [
    {
        label: 'Très petites',
        columns: { base: 5, xs: 6, sm: 8, md: 10, lg: 12 },
    },
    { label: 'Petites', columns: { base: 4, xs: 5, sm: 7, md: 8, lg: 10 } },
    { label: 'Moyennes', columns: { base: 3, xs: 4, sm: 5, md: 6, lg: 7 } },
    { label: 'Grandes', columns: { base: 2, xs: 3, sm: 4, md: 5, lg: 5 } },
    { label: 'Très grandes', columns: { base: 2, xs: 2, sm: 3, md: 3, lg: 4 } },
];

/** Colonnes de la grille pour un cran de la glissière. */
export const gridColumns = (size: number) => CARD_SIZES[size]!.columns;

/** Colonnes du mode liste : une ligne par série, en colonnes si large. */
export const LIST_COLUMNS = { base: 1, sm: 2, lg: 3 };

const isLayout = (value: unknown): value is LibraryLayout =>
    LAYOUT_OPTIONS.some((option) => option.value === value);
const isSize = (value: unknown): value is number =>
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) < CARD_SIZES.length;

/** Réglage d'affichage de cet appareil (« Thème et affichage »), suivi partout. */
export const useLibraryDisplay = () => {
    const [saved, setSaved] = useLocalStorage<Partial<LibraryDisplay>>({
        key: 'bento:display',
        defaultValue: {},
        getInitialValueInEffect: false,
    });
    const display: LibraryDisplay = {
        layout: isLayout(saved?.layout) ? saved.layout : DEFAULT_DISPLAY.layout,
        size: isSize(saved?.size) ? saved.size : DEFAULT_DISPLAY.size,
        coversOnly:
            typeof saved?.coversOnly === 'boolean'
                ? saved.coversOnly
                : DEFAULT_DISPLAY.coversOnly,
    };
    return {
        ...display,
        set: (changes: Partial<LibraryDisplay>) =>
            setSaved((current) => ({ ...current, ...changes })),
    };
};
