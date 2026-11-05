import { compareNames } from '@server/types';

/** Ce dont les filtres ont besoin pour une série de la liste. */
export type ListedSeries = {
    name: string;
    volumeCount: number;
    readCount: number;
    // Tomes ouverts (lus ou en cours).
    startedCount: number;
    lastAddedAt: string | null;
};

export type ReadingFilter = 'all' | 'unread' | 'started' | 'read';
export type SeriesSort = 'name' | 'recent';

export const READING_FILTERS: { value: ReadingFilter; label: string }[] = [
    { value: 'all', label: 'Toutes' },
    { value: 'unread', label: 'Non lues' },
    { value: 'started', label: 'Commencées' },
    { value: 'read', label: 'Lues' },
];

export const SERIES_SORTS: { value: SeriesSort; label: string }[] = [
    { value: 'name', label: 'Nom' },
    { value: 'recent', label: 'Ajouts récents' },
];

/** État de lecture d'une série pour la personne. */
export const readingStateOf = (
    s: ListedSeries,
): Exclude<ReadingFilter, 'all'> =>
    s.readCount >= s.volumeCount
        ? 'read'
        : s.startedCount > 0
          ? 'started'
          : 'unread';

/** Séries à afficher, filtrées par état de lecture puis triées. */
export const filterSeries = <T extends ListedSeries>(
    series: T[],
    { filter, sort }: { filter: ReadingFilter; sort: SeriesSort },
): T[] => {
    const kept =
        filter === 'all'
            ? [...series]
            : series.filter((s) => readingStateOf(s) === filter);
    return sort === 'recent'
        ? kept.sort(
              (a, b) =>
                  (b.lastAddedAt ?? '').localeCompare(a.lastAddedAt ?? '') ||
                  compareNames(a.name, b.name),
          )
        : kept;
};
