import { compareNames } from '@server/types';

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
};

/** État de lecture d'une série pour la personne. */
export type ReadingState = 'unread' | 'started' | 'read';
export type SeriesSort = 'name' | 'recent';
export type StatusFilter = 'all' | 'ongoing' | 'completed';

export const SERIES_SORTS: { value: SeriesSort; label: string }[] = [
    { value: 'name', label: 'Nom' },
    { value: 'recent', label: 'Ajouts récents' },
];

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Toutes' },
    { value: 'ongoing', label: 'En cours de parution' },
    { value: 'completed', label: 'Terminées' },
];

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
                : 0),
    );
};
