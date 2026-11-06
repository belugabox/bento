// Thème de l'appli, partagé avec le client (sans dépendance).

/** Couleurs d'accent proposées (palettes Mantine). */
export const ACCENTS = [
    'teal',
    'green',
    'lime',
    'cyan',
    'blue',
    'indigo',
    'violet',
    'grape',
    'pink',
    'red',
    'orange',
    'yellow',
] as const;

export type Accent = (typeof ACCENTS)[number];

/** Clair, sombre, ou selon le système de l'appareil. */
export const COLOR_SCHEMES = ['light', 'dark', 'auto'] as const;

export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export type Appearance = { colorScheme: ColorScheme; accent: Accent };
