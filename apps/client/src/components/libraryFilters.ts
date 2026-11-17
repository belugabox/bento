import type { FamilyReader } from '@/components/homeGroups';
import { type ListedSeries, readingStateOf } from '@/components/seriesFilters';

/** Où en est la personne dans la série (filtre « Ma lecture »). */
export type ReadingFilter =
    'toread' | 'unread' | 'started' | 'new' | 'read' | 'notforme' | 'foryou';

export const READING_FILTERS: { value: ReadingFilter; label: string }[] = [
    { value: 'toread', label: 'À lire' },
    // Les suggestions de l'accueil (« Tout voir » de « Pour toi »).
    { value: 'foryou', label: 'Pour toi' },
    { value: 'unread', label: 'Pas commencés' },
    { value: 'started', label: 'En cours' },
    { value: 'new', label: 'Nouveaux tomes' },
    { value: 'read', label: 'Lus' },
    // Retirées des suggestions : de quoi les y remettre.
    { value: 'notforme', label: 'Pas pour moi' },
];

export type ReleaseFilter = 'ongoing' | 'completed';

export const RELEASE_FILTERS: { value: ReleaseFilter; label: string }[] = [
    { value: 'ongoing', label: 'En cours de parution' },
    { value: 'completed', label: 'Terminée' },
];

/**
 * Filtres de la bibliothèque, dans l'adresse (le retour arrière les garde) :
 * plusieurs valeurs par filtre, dont une seule suffit ; les filtres se
 * cumulent.
 */
export type LibraryFilters = {
    reading: ReadingFilter[];
    formats: string[];
    genres: string[];
    release: ReleaseFilter[];
    /** Comptes de la famille : séries lues par l'un d'eux. */
    readers: number[];
    /** Séries dont un tome est téléchargé sur l'appareil. */
    downloaded: boolean;
};

export const NO_FILTERS: LibraryFilters = {
    reading: [],
    formats: [],
    genres: [],
    release: [],
    readers: [],
    downloaded: false,
};

// Clé de chaque filtre dans l'adresse (`?genre=Action&genre=Drame`).
const KEYS = {
    reading: 'reading',
    formats: 'format',
    genres: 'genre',
    release: 'status',
    readers: 'reader',
    downloaded: 'device',
} as const;

const isReading = (value: string): value is ReadingFilter =>
    READING_FILTERS.some((f) => f.value === value);
const isRelease = (value: string): value is ReleaseFilter =>
    RELEASE_FILTERS.some((f) => f.value === value);

export const readFilters = (params: URLSearchParams): LibraryFilters => ({
    reading: params.getAll(KEYS.reading).filter(isReading),
    formats: params.getAll(KEYS.formats),
    genres: params.getAll(KEYS.genres),
    release: params.getAll(KEYS.release).filter(isRelease),
    readers: params
        .getAll(KEYS.readers)
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    downloaded: params.get(KEYS.downloaded) === '1',
});

/** Adresse avec ces filtres à la place des anciens (le reste est gardé). */
export const writeFilters = (
    params: URLSearchParams,
    filters: LibraryFilters,
) => {
    const next = new URLSearchParams(params);
    for (const key of Object.values(KEYS)) next.delete(key);
    for (const value of filters.reading) next.append(KEYS.reading, value);
    for (const value of filters.formats) next.append(KEYS.formats, value);
    for (const value of filters.genres) next.append(KEYS.genres, value);
    for (const value of filters.release) next.append(KEYS.release, value);
    for (const id of filters.readers) next.append(KEYS.readers, String(id));
    if (filters.downloaded) next.set(KEYS.downloaded, '1');
    return next;
};

/** Adresse de la bibliothèque avec ces filtres (« Tout voir » de l'accueil). */
export const libraryLink = (
    filters: Partial<LibraryFilters>,
    extra: Record<string, string> = {},
) => {
    const params = writeFilters(new URLSearchParams(extra), {
        ...NO_FILTERS,
        ...filters,
    });
    const search = params.toString();
    return `/library${search && `?${search}`}`;
};

export const filterCount = (filters: LibraryFilters) =>
    filters.reading.length +
    filters.formats.length +
    filters.genres.length +
    filters.release.length +
    filters.readers.length +
    (filters.downloaded ? 1 : 0);

/** Ce dont les filtres ont besoin en plus des séries. */
export type FilterContext = {
    readers?: Pick<FamilyReader, 'id' | 'seriesIds'>[];
    /** Séries dont un tome est sur l'appareil. */
    downloaded?: Set<number>;
    /** Suggestions « Pour toi » : série → raison. */
    forYou?: Map<number, string>;
};

const READING_TESTS: Record<
    ReadingFilter,
    (s: ListedSeries & { id: number }, context: FilterContext) => boolean
> = {
    toread: (s) => !!s.toRead,
    unread: (s) => readingStateOf(s) === 'unread',
    started: (s) => readingStateOf(s) === 'started',
    new: (s) => (s.newCount ?? 0) > 0,
    read: (s) => readingStateOf(s) === 'read',
    notforme: (s) => !!s.notForMe,
    foryou: (s, { forYou }) => !!forYou?.has(s.id),
};

/** La série passe-t-elle tous les filtres ? */
export const matchesFilters = (
    s: ListedSeries & { id: number },
    filters: LibraryFilters,
    context: FilterContext = {},
) => {
    const { readers = [], downloaded = new Set() } = context;
    if (
        filters.reading.length &&
        !filters.reading.some((value) => READING_TESTS[value](s, context))
    ) {
        return false;
    }
    if (filters.formats.length && !filters.formats.includes(s.format ?? '')) {
        return false;
    }
    if (
        filters.genres.length &&
        !(s.genres ?? []).some((genre) => filters.genres.includes(genre))
    ) {
        return false;
    }
    if (
        filters.release.length &&
        !(s.status && filters.release.includes(s.status))
    ) {
        return false;
    }
    if (
        filters.readers.length &&
        !readers.some(
            (reader) =>
                filters.readers.includes(reader.id) &&
                reader.seriesIds.includes(s.id),
        )
    ) {
        return false;
    }
    return !filters.downloaded || downloaded.has(s.id);
};

/** Pastille d'un filtre choisi : son nom, et les filtres sans lui. */
export type ActiveFilter = {
    key: string;
    label: string;
    without: LibraryFilters;
};

/** Filtres choisis, en pastilles (un toucher en retire un). */
export const activeFilters = (
    filters: LibraryFilters,
    readers: Pick<FamilyReader, 'id' | 'name'>[] = [],
): ActiveFilter[] => [
    ...filters.reading.map((value) => ({
        key: `reading:${value}`,
        label: READING_FILTERS.find((f) => f.value === value)!.label,
        without: {
            ...filters,
            reading: filters.reading.filter((v) => v !== value),
        },
    })),
    ...filters.formats.map((value) => ({
        key: `format:${value}`,
        label: value,
        without: {
            ...filters,
            formats: filters.formats.filter((v) => v !== value),
        },
    })),
    ...filters.genres.map((value) => ({
        key: `genre:${value}`,
        label: value,
        without: {
            ...filters,
            genres: filters.genres.filter((v) => v !== value),
        },
    })),
    ...filters.release.map((value) => ({
        key: `status:${value}`,
        label: RELEASE_FILTERS.find((f) => f.value === value)!.label,
        without: {
            ...filters,
            release: filters.release.filter((v) => v !== value),
        },
    })),
    ...filters.readers.map((id) => ({
        key: `reader:${id}`,
        label: `Lu par ${readers.find((r) => r.id === id)?.name ?? '…'}`,
        without: {
            ...filters,
            readers: filters.readers.filter((v) => v !== id),
        },
    })),
    ...(filters.downloaded
        ? [
              {
                  key: 'device',
                  label: 'Sur cet appareil',
                  without: { ...filters, downloaded: false },
              },
          ]
        : []),
];

/** Ajoute la valeur si elle n'y est pas, la retire sinon. */
export const toggle = <T>(values: T[], value: T) =>
    values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value];
