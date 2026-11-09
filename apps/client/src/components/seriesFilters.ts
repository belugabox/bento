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

/** État de lecture, ou la liste « à lire » de la personne. */
export type ReadingFilter = 'all' | 'toread' | 'unread' | 'started' | 'read';
export type SeriesSort = 'name' | 'recent';
export type StatusFilter = 'all' | 'ongoing' | 'completed';

export const READING_FILTERS: { value: ReadingFilter; label: string }[] = [
    { value: 'all', label: 'Toutes' },
    { value: 'toread', label: 'À lire' },
    { value: 'unread', label: 'Non lues' },
    { value: 'started', label: 'En cours' },
    { value: 'read', label: 'Lues' },
];

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
export const readingStateOf = (
    s: ListedSeries,
): Exclude<ReadingFilter, 'all' | 'toread'> =>
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

const matchesReading = (s: ListedSeries, filter: ReadingFilter) =>
    filter === 'all' ||
    (filter === 'toread' ? !!s.toRead : readingStateOf(s) === filter);

/**
 * Séries à afficher, filtrées (lecture, genre, statut) puis
 * triées.
 */
export const filterSeries = <T extends ListedSeries>(
    series: T[],
    {
        filter,
        sort,
        genre = null,
        status = 'all',
    }: {
        filter: ReadingFilter;
        sort: SeriesSort;
        genre?: string | null;
        status?: StatusFilter;
    },
): T[] => {
    const kept = series.filter(
        (s) =>
            matchesReading(s, filter) &&
            (!genre || (s.genres ?? []).includes(genre)) &&
            (status === 'all' || s.status === status),
    );
    return sort === 'recent'
        ? kept.sort(
              (a, b) =>
                  (b.lastAddedAt ?? '').localeCompare(a.lastAddedAt ?? '') ||
                  compareNames(a.name, b.name),
          )
        : kept;
};
