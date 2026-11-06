// Format, âge, genres et thèmes d'une série, partagés avec le client
// (sans dépendance).

/** Sens de lecture : BD, manga (doubles pages inversées), manga, webtoon. */
export const READING_MODES = ['ltr', 'ltr-manga', 'rtl', 'webtoon'] as const;

export type ReadingMode = (typeof READING_MODES)[number];

/** Format de la liste gérée par l'admin, avec son mode de lecture. */
export type FormatEntry = { name: string; readingMode: ReadingMode };

/**
 * Liste de départ des formats. Le mode de lecture d'un format sert aux
 * séries qui n'en ont pas choisi.
 */
export const DEFAULT_FORMATS: FormatEntry[] = [
    { name: 'Manga', readingMode: 'ltr-manga' },
    { name: 'Manhwa', readingMode: 'ltr' },
    { name: 'Manhua', readingMode: 'ltr' },
    { name: 'Webtoon', readingMode: 'webtoon' },
    { name: 'BD', readingMode: 'ltr' },
    { name: 'Comics', readingMode: 'ltr' },
];

/**
 * Grille d'âges de départ, à la française (éditeurs, Manga-news) : l'admin
 * la change dans les réglages.
 */
export const DEFAULT_AGE_STEPS = [0, 8, 10, 12, 14, 16, 18];

/** « Tout public », « 12+ ». */
export const ageLabel = (age: number) =>
    age === 0 ? 'Tout public' : `${age}+`;

/** Genre de la liste gérée par l'admin, avec les autres noms qu'il reconnaît. */
export type GenreEntry = { name: string; aliases: string[] };

/**
 * Liste de départ : les genres de Manga-news, doublons fusionnés (humour
 * avec comédie, suspense avec thriller…). Les alias rangent les genres de
 * Wikipédia, de Manga-news et des anciens fichiers.
 */
export const DEFAULT_GENRES: GenreEntry[] = [
    { name: 'Action', aliases: [] },
    { name: 'Aventure', aliases: ['Adventure'] },
    { name: 'Comédie', aliases: ['Humour', 'Parodie', 'Comedy'] },
    { name: 'Drame', aliases: ['Emotion', 'Tragique', 'Tragédie', 'Drama'] },
    { name: 'Fantastique', aliases: ['Surnaturel', 'Supernatural'] },
    {
        name: 'Fantasy',
        aliases: ['Heroic fantasy', 'Dark fantasy', 'Fantasy épique'],
    },
    { name: 'Horreur', aliases: ['Horror', 'Gore', 'Épouvante'] },
    {
        name: 'Thriller',
        aliases: ['Suspense', 'Techno-thriller', 'Thriller psychologique'],
    },
    { name: 'Policier', aliases: ['Polar', 'Enquête', 'Crime', 'Détective'] },
    { name: 'Mystère', aliases: ['Mystery'] },
    { name: 'Romance', aliases: ['Romantique', 'Romance'] },
    {
        name: 'Science-fiction',
        aliases: ['SF', 'Sci-fi', 'Mecha', 'Cyberpunk', 'Space opera'],
    },
    { name: 'Sport', aliases: ['Sports'] },
    { name: 'Tranche de vie', aliases: ['Slice of life'] },
    { name: 'Historique', aliases: ['Histoire', 'Historical'] },
    { name: 'Arts martiaux', aliases: ['Martial arts'] },
    { name: 'Psychologique', aliases: ['Psychological', 'Philosophique'] },
    { name: 'Gastronomie', aliases: ['Cuisine', 'Culinaire', 'Cooking'] },
    { name: 'Musique', aliases: ['Music'] },
    { name: 'École', aliases: ['School life', 'Scolaire', 'School'] },
];

/** Clé de comparaison : sans accents, casse ni ponctuation (« Shōnen » = « shonen »). */
export const genreKey = (value: string) =>
    value
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9+]+/g, ' ')
        .trim();

/** Valeurs d'une liste ComicInfo (« Action, Drame ; Sport »). */
export const splitList = (value: string | null | undefined) =>
    (value ?? '')
        .split(/[,;]/)
        .map((item) => item.trim())
        .filter(Boolean);

// Classifications d'âge rangées parmi les genres : la classification
// (`AgeRating`) en tient lieu.
const AGE_WORDS = [
    'mature',
    'adulte',
    'adultes',
    'adult',
    'adults only',
    'everyone',
    'teen',
    'tout public',
];

/** « Mature », « Mature 17+ », « 12+ »… */
const isAge = (key: string) =>
    /^\d+ ?\+$/.test(key) ||
    AGE_WORDS.some((word) => key === word || key.startsWith(`${word} `));

export type Classification = { genres: string[]; themes: string[] };

/**
 * Range les genres et les thèmes (`Genre` et `Tags` du ComicInfo) d'après
 * la liste gérée : un genre reconnu prend son nom de la liste, un âge est
 * retiré, le reste devient un thème.
 */
export const classify = (
    genre: string | null | undefined,
    tags: string | null | undefined,
    catalog: GenreEntry[],
): Classification => {
    const names = new Map<string, string>();
    for (const entry of catalog) {
        for (const alias of entry.aliases)
            names.set(genreKey(alias), entry.name);
    }
    // Le nom l'emporte sur l'alias d'un autre genre.
    for (const entry of catalog) names.set(genreKey(entry.name), entry.name);

    const genres: string[] = [];
    const themes: string[] = [];
    const seenThemes = new Set<string>();
    const place = (value: string, isTag: boolean) => {
        const key = genreKey(value);
        if (!key) return;
        const name = names.get(key);
        if (name) {
            if (!genres.includes(name)) genres.push(name);
        } else if (!isTag && isAge(key)) {
            // Retiré : la classification en tient lieu.
        } else if (!seenThemes.has(key)) {
            seenThemes.add(key);
            themes.push(value);
        }
    };
    for (const value of splitList(genre)) place(value, false);
    for (const value of splitList(tags)) place(value, true);
    return { genres, themes };
};
