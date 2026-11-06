import { useColorScheme, useLocalStorage } from '@mantine/hooks';

import {
    ACCENTS as ACCENT_VALUES,
    type Accent,
    type Appearance,
    COLOR_SCHEMES,
    type ColorScheme,
} from '@server/types';

export type { Accent, Appearance, ColorScheme };

const ACCENT_LABELS: Record<Accent, string> = {
    teal: 'Sarcelle',
    green: 'Vert',
    lime: 'Citron vert',
    cyan: 'Cyan',
    blue: 'Bleu',
    indigo: 'Indigo',
    violet: 'Violet',
    grape: 'Prune',
    pink: 'Rose',
    red: 'Rouge',
    orange: 'Orange',
    yellow: 'Jaune',
};

/** Couleurs d'accent proposées (palettes Mantine). */
export const ACCENTS = ACCENT_VALUES.map((value) => ({
    value,
    label: ACCENT_LABELS[value],
}));

export const COLOR_SCHEME_OPTIONS: { value: ColorScheme; label: string }[] = [
    { value: 'light', label: 'Clair' },
    { value: 'dark', label: 'Sombre' },
    { value: 'auto', label: 'Système' },
];

/** Thème par défaut tant que celui de l'admin n'est pas connu. */
export const DEFAULT_APPEARANCE: Appearance = {
    colorScheme: 'auto',
    accent: 'violet',
};

const isAccent = (value: unknown): value is Accent =>
    ACCENT_VALUES.includes(value as Accent);

const isColorScheme = (value: unknown): value is ColorScheme =>
    COLOR_SCHEMES.includes(value as ColorScheme);

/**
 * Thème par défaut choisi par l'admin, gardé sur l'appareil : au
 * lancement suivant, l'appli s'affiche tout de suite avec lui.
 */
export const useDefaultAppearance = () => {
    const [saved, setSaved] = useLocalStorage<Appearance>({
        key: 'bento:theme:defaults',
        defaultValue: DEFAULT_APPEARANCE,
        getInitialValueInEffect: false,
    });
    const appearance: Appearance = {
        colorScheme: isColorScheme(saved?.colorScheme)
            ? saved.colorScheme
            : DEFAULT_APPEARANCE.colorScheme,
        accent: isAccent(saved?.accent)
            ? saved.accent
            : DEFAULT_APPEARANCE.accent,
    };
    return [appearance, setSaved] as const;
};

const MODE_KEY = 'bento:theme:mode';

// Mode choisi avant ce réglage, gardé par Mantine : repris une fois.
try {
    const legacy = localStorage.getItem('mantine-color-scheme-value');
    if (isColorScheme(legacy) && localStorage.getItem(MODE_KEY) === null) {
        localStorage.setItem(MODE_KEY, JSON.stringify(legacy));
    }
    localStorage.removeItem('mantine-color-scheme-value');
} catch {
    // Stockage indisponible : le thème de l'admin s'applique.
}

/**
 * Thème de cet appareil : son propre choix de mode et de couleur, sinon
 * celui de l'admin. Toutes les instances du hook se suivent (le thème de
 * l'appli et le réglage). `reset` revient au thème de l'admin.
 */
export const useAppearance = () => {
    const [defaults] = useDefaultAppearance();
    const [accent, setAccent] = useLocalStorage<Accent | null>({
        key: 'bento:theme:accent',
        defaultValue: null,
        getInitialValueInEffect: false,
    });
    const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme | null>({
        key: MODE_KEY,
        defaultValue: null,
        getInitialValueInEffect: false,
    });
    const system = useColorScheme('dark', { getInitialValueInEffect: false });
    const mode = isColorScheme(colorScheme)
        ? colorScheme
        : defaults.colorScheme;
    return {
        accent: isAccent(accent) ? accent : defaults.accent,
        colorScheme: mode,
        /** Clair ou sombre, une fois « Système » résolu. */
        resolved: mode === 'auto' ? system : mode,
        /** L'appareil a ses propres réglages. */
        custom: isAccent(accent) || isColorScheme(colorScheme),
        setAccent,
        setColorScheme,
        reset: () => {
            setAccent(null);
            setColorScheme(null);
        },
    };
};
