import { useLocalStorage } from '@mantine/hooks';

export type CardSize = 'small' | 'medium' | 'large';
export type LibraryLayout = 'grid' | 'list';

/** Affichage des séries et des tomes, propre à l'appareil. */
export type LibraryDisplay = {
    layout: LibraryLayout;
    size: CardSize;
    /** Grille de couvertures, sans titre dessous. */
    coversOnly: boolean;
};

export const DEFAULT_DISPLAY: LibraryDisplay = {
    layout: 'grid',
    size: 'medium',
    coversOnly: false,
};

export const LAYOUT_OPTIONS: { value: LibraryLayout; label: string }[] = [
    { value: 'grid', label: 'Grille' },
    { value: 'list', label: 'Liste' },
];

export const SIZE_OPTIONS: { value: CardSize; label: string }[] = [
    { value: 'small', label: 'Petites' },
    { value: 'medium', label: 'Moyennes' },
    { value: 'large', label: 'Grandes' },
];

/** Colonnes de la grille selon la taille des cartes et la largeur. */
export const GRID_COLUMNS: Record<
    CardSize,
    { base: number; xs: number; sm: number; md: number; lg: number }
> = {
    small: { base: 4, xs: 5, sm: 7, md: 8, lg: 10 },
    medium: { base: 3, xs: 4, sm: 5, md: 6, lg: 7 },
    large: { base: 2, xs: 3, sm: 4, md: 5, lg: 5 },
};

/** Colonnes du mode liste : une ligne par série, en colonnes si large. */
export const LIST_COLUMNS = { base: 1, sm: 2, lg: 3 };

const isLayout = (value: unknown): value is LibraryLayout =>
    LAYOUT_OPTIONS.some((option) => option.value === value);
const isSize = (value: unknown): value is CardSize =>
    SIZE_OPTIONS.some((option) => option.value === value);

/** Réglage d'affichage de cet appareil (Apparence), suivi partout. */
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
