import { type Format, compareNames } from '@server/types';

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
    format?: Format;
        status?: 'ongoing' | 'completed' | null;
    toRead?: boolean;
    collectionIds?: number[];
};

/** État de lecture, ou la liste « à lire » de la personne. */
export type ReadingFilter = 'all' | 'toread' | 'unread' | 'started' | 'read';
export type SeriesSort = 'name' | 'recent';
export type StatusFilter = 'all' | 'ongoing' | 'completed';
/** Toutes les séries, ou une collection (`collection:<id>`). */
export type ListFilter = 'all' | `collection:${number}`;

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
    { value: 'all', label: 'Tous les statuts' },
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

/** Valeurs présentes dans la liste (genres, formats…), une seule fois. */
const present = <V>(values: V[]) => [...new Set(values)];

/** Genres présents dans la liste, par ordre alphabétique. */
export const allGenres = (series: Pick<ListedSeries, 'genres'>[]) =>
    present(series.flatMap((s) => s.genres ?? [])).sort((a, b) =>
        a.localeCompare(b, 'fr'),
    );

/** Formats présents dans la liste. */
export const allFormats = (series: Pick<ListedSeries, 'format'>[]) =>
    present(series.flatMap((s) => (s.format ? [s.format] : [])));

const inList = (s: ListedSeries, list: ListFilter) =>
    list === 'all' ||
    (s.collectionIds ?? []).includes(Number(list.split(':')[1]));

const matchesReading = (s: ListedSeries, filter: ReadingFilter) =>
    filter === 'all' ||
    (filter === 'toread' ? !!s.toRead : readingStateOf(s) === filter);

/**
 * Séries à afficher, filtrées (lecture, liste, format, genre,
 * statut) puis triées.
 */
export const filterSeries = <T extends ListedSeries>(
    series: T[],
    {
        filter,
        sort,
        list = 'all',
        genre = null,
        format = null,
        status = 'all',
    }: {
        filter: ReadingFilter;
        sort: SeriesSort;
        list?: ListFilter;
        genre?: string | null;
        format?: Format | null;
                status?: StatusFilter;
    },
): T[] => {
    const kept = series.filter(
        (s) =>
            matchesReading(s, filter) &&
            inList(s, list) &&
            (!genre || (s.genres ?? []).includes(genre)) &&
            (!format || s.format === format) &&
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
