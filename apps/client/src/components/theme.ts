import { useLocalStorage } from '@mantine/hooks';

/** Couleurs d'accent proposées (palettes Mantine). */
export const ACCENTS = [
    { value: 'teal', label: 'Sarcelle' },
    { value: 'green', label: 'Vert' },
    { value: 'lime', label: 'Citron vert' },
    { value: 'cyan', label: 'Cyan' },
    { value: 'blue', label: 'Bleu' },
    { value: 'indigo', label: 'Indigo' },
    { value: 'violet', label: 'Violet' },
    { value: 'grape', label: 'Prune' },
    { value: 'pink', label: 'Rose' },
    { value: 'red', label: 'Rouge' },
    { value: 'orange', label: 'Orange' },
    { value: 'yellow', label: 'Jaune' },
] as const;

export type Accent = (typeof ACCENTS)[number]['value'];

export const DEFAULT_ACCENT: Accent = 'teal';

const isAccent = (value: unknown): value is Accent =>
    ACCENTS.some((accent) => accent.value === value);

/**
 * Couleur d'accent choisie, gardée sur l'appareil. Toutes les instances du
 * hook se suivent (le thème de l'appli et le réglage).
 */
export const useAccent = () => {
    const [accent, setAccent] = useLocalStorage<Accent>({
        key: 'bento:theme:accent',
        defaultValue: DEFAULT_ACCENT,
        getInitialValueInEffect: false,
    });
    return [isAccent(accent) ? accent : DEFAULT_ACCENT, setAccent] as const;
};
