import { ageLabel, compareNames } from '@server/types';

/** Ce dont les filtres ont besoin pour une série de la liste. */
export type ListedSeries = {
    name: string;
    volumeCount: number;
    readCount: number;
    // Tomes ouverts (lus ou en cours).
    startedCount: number;
    lastAddedAt: string | null;
    // Genres rangés par la liste des genres.
    genres?: string[];
    // Nom du format ; null = pas encore choisi.
    format?: string | null;
    status?: 'ongoing' | 'completed' | null;
    toRead?: boolean;
    // Note des lecteurs, sur 5 (tri « Mieux notées »).
    rating?: number | null;
    // Tomes ajoutés depuis la dernière lecture (pastille « +2 »).
    newCount?: number;
    year?: number | null;
    // Âge minimal : choisi dans Bento, sinon déduit des tomes.
    age?: number | null;
    // Auteur de la fiche, et dessin du premier tome.
    writer?: string | null;
    penciller?: string | null;
};

/** « Auteur · Dessinateur », sans répéter un même nom. */
export const creditsOf = (s: Pick<ListedSeries, 'writer' | 'penciller'>) => {
    const names: string[] = [];
    for (const raw of [s.writer, s.penciller]) {
        for (const name of (raw ?? '').split(',')) {
            const trimmed = name.trim();
            if (
                trimmed &&
                !names.some(
                    (n) =>
                        n.toLocaleLowerCase('fr') ===
                        trimmed.toLocaleLowerCase('fr'),
                )
            ) {
                names.push(trimmed);
            }
        }
    }
    return names.join(' · ');
};

/** État de lecture d'une série pour la personne. */
export type ReadingState = 'unread' | 'started' | 'read';
export type SeriesSort = 'name' | 'recent' | 'rating';
export type StatusFilter = 'all' | 'ongoing' | 'completed';

export const SERIES_SORTS: { value: SeriesSort; label: string }[] = [
    { value: 'name', label: 'Nom' },
    { value: 'recent', label: 'Ajouts récents' },
    { value: 'rating', label: 'Mieux notées' },
];

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Toutes' },
    { value: 'ongoing', label: 'En cours de parution' },
    { value: 'completed', label: 'Terminées' },
];

const STATUS_LABELS = {
    ongoing: 'En cours de parution',
    completed: 'Terminée',
} as const;

/**
 * Infos d'une série pour le mode liste : format, année, âge et parution,
 * puis ses genres (une ligne chacun ; vide s'il n'y a rien).
 */
export const seriesDetails = (s: ListedSeries): string[] =>
    [
        creditsOf(s),
        [
            s.format,
            s.year,
            s.age !== null && s.age !== undefined ? ageLabel(s.age) : null,
            s.status ? STATUS_LABELS[s.status] : null,
        ]
            .filter((value) => value !== null && value !== undefined)
            .join(' · '),
        (s.genres ?? []).join(', '),
    ].filter(Boolean);

/** État de lecture d'une série pour la personne. */
export const readingStateOf = (s: ListedSeries): ReadingState =>
    s.readCount >= s.volumeCount
        ? 'read'
        : s.startedCount > 0
          ? 'started'
          : 'unread';

/**
 * Genres présents dans la liste, avec leur nombre de séries : les plus
 * fréquents d'abord.
 */
export const genresByCount = (series: Pick<ListedSeries, 'genres'>[]) => {
    const counts = new Map<string, number>();
    for (const genre of series.flatMap((s) => s.genres ?? [])) {
        counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
    return [...counts]
        .map(([name, count]) => ({ name, count }))
        .sort(
            (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'),
        );
};

/**
 * Rang d'une série sur l'accueil : celles de la liste « à lire » d'abord,
 * les séries entièrement lues à la fin.
 */
const readingRank = (s: ListedSeries) =>
    readingStateOf(s) === 'read' ? 2 : s.toRead ? 0 : 1;

/**
 * Séries à afficher, filtrées (genre, statut) puis triées : « à lire »
 * d'abord, puis les autres, les séries lues à la fin ; dans chaque groupe,
 * par nom ou par ajouts récents.
 */
export const filterSeries = <T extends ListedSeries>(
    series: T[],
    {
        sort,
        genre = null,
        status = 'all',
    }: {
        sort: SeriesSort;
        genre?: string | null;
        status?: StatusFilter;
    },
): T[] => {
    const kept = series.filter(
        (s) =>
            (!genre || (s.genres ?? []).includes(genre)) &&
            (status === 'all' || s.status === status),
    );
    // Tri stable : l'ordre par nom du serveur est gardé dans chaque groupe.
    return kept.sort(
        (a, b) =>
            readingRank(a) - readingRank(b) ||
            (sort === 'recent'
                ? (b.lastAddedAt ?? '').localeCompare(a.lastAddedAt ?? '') ||
                  compareNames(a.name, b.name)
                : sort === 'rating'
                  ? // Sans note à la fin.
                    (b.rating ?? -1) - (a.rating ?? -1)
                  : 0),
    );
};
