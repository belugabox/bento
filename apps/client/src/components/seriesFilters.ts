import { compareNames } from '@server/types';

/** Ce dont les filtres ont besoin pour une série de la liste. */
export type ListedSeries = {
    name: string;
    volumeCount: number;
    readCount: number;
    // Tomes ouverts (lus ou en cours).
    startedCount: number;
    lastAddedAt: string | null;
    // « Action, Aventure ».
    genre?: string | null;
    status?: 'ongoing' | 'completed' | null;
    favorite?: boolean;
    toRead?: boolean;
    collectionIds?: number[];
};

export type ReadingFilter = 'all' | 'unread' | 'started' | 'read';
export type SeriesSort = 'name' | 'recent';
export type StatusFilter = 'all' | 'ongoing' | 'completed';
/** Toutes les séries, une liste personnelle, ou `collection:<id>`. */
export type ListFilter = 'all' | 'favorite' | 'toread' | `collection:${number}`;

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

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Tous les statuts' },
    { value: 'ongoing', label: 'En cours de parution' },
    { value: 'completed', label: 'Terminées' },
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

/** Genres d'une série (« Action, Aventure » : deux genres). */
export const genresOf = (s: Pick<ListedSeries, 'genre'>) =>
    (s.genre ?? '')
        .split(/[,;/]/)
        .map((genre) => genre.trim())
        .filter(Boolean);

/** Genres présents dans la liste, par ordre alphabétique. */
export const allGenres = (series: Pick<ListedSeries, 'genre'>[]) => {
    const byKey = new Map<string, string>();
    for (const genre of series.flatMap(genresOf)) {
        const key = genre.toLocaleLowerCase('fr');
        if (!byKey.has(key)) byKey.set(key, genre);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'fr'));
};

const inList = (s: ListedSeries, list: ListFilter) => {
    if (list === 'all') return true;
    if (list === 'favorite') return !!s.favorite;
    if (list === 'toread') return !!s.toRead;
    return (s.collectionIds ?? []).includes(Number(list.split(':')[1]));
};

/** Séries à afficher, filtrées (lecture, liste, genre, statut) puis triées. */
export const filterSeries = <T extends ListedSeries>(
    series: T[],
    {
        filter,
        sort,
        list = 'all',
        genre = null,
        status = 'all',
    }: {
        filter: ReadingFilter;
        sort: SeriesSort;
        list?: ListFilter;
        genre?: string | null;
        status?: StatusFilter;
    },
): T[] => {
    const genreKey = genre?.toLocaleLowerCase('fr');
    const kept = series.filter(
        (s) =>
            (filter === 'all' || readingStateOf(s) === filter) &&
            inList(s, list) &&
            (!genreKey ||
                genresOf(s).some(
                    (g) => g.toLocaleLowerCase('fr') === genreKey,
                )) &&
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
