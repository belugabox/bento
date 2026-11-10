import { genreKey, sortKeyOf } from '@server/types';

import { ageLabel } from '@/components/ageLimits';
import { type ListedSeries, readingStateOf } from '@/components/seriesFilters';

/**
 * Groupements de l'accueil (menu de tri), gardés sur l'appareil. Le bloc
 * « En cours » reste toujours en tête ; le reste des séries est rangé ainsi.
 */
export const GROUPINGS = [
    { value: 'reading', label: 'Lecture' },
    { value: 'format', label: 'Format' },
    { value: 'age', label: 'Âge' },
    { value: 'letter', label: 'Lettre' },
    { value: 'added', label: 'Date d’ajout' },
    { value: 'reader', label: 'Lecteur' },
    { value: 'none', label: 'Aucun' },
] as const;
export type Grouping = (typeof GROUPINGS)[number]['value'];

export const isGrouping = (value: unknown): value is Grouping =>
    GROUPINGS.some((g) => g.value === value);

/** Bloc de l'accueil : un titre (aucun pour « Aucun »), et ses séries. */
export type HomeGroup<T> = { key: string; title: string | null; list: T[] };

type Groupable = ListedSeries & { id: number; age?: number | null };

/** Personne de la famille et les séries qu'elle a lues (« Lu par »). */
export type FamilyReader = { id: number; name: string; seriesIds: number[] };

/** Première lettre du nom de tri (articles ignorés, sans accent) ; « # » sinon. */
export const letterOf = (name: string) => {
    const first = genreKey(sortKeyOf(name)).charAt(0).toUpperCase();
    return /[A-Z]/.test(first) ? first : '#';
};

/**
 * Groupes rangés par `rank` (les clés sans rang à la fin), dans l'ordre des
 * séries reçues à l'intérieur de chacun.
 */
const groupBy = <T, K>(
    series: T[],
    keyOf: (s: T) => K,
    titleOf: (key: K) => string,
    rank: (a: K, b: K) => number,
): HomeGroup<T>[] => {
    const groups = new Map<K, T[]>();
    for (const s of series) {
        const key = keyOf(s);
        groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()]
        .sort(([a], [b]) => rank(a, b))
        .map(([key, list]) => ({
            key: String(key),
            title: titleOf(key),
            list,
        }));
};

/** Les vides à la fin. */
const nullsLast =
    <K>(compare: (a: K, b: K) => number) =>
    (a: K | null, b: K | null) =>
        a === null ? (b === null ? 0 : 1) : b === null ? -1 : compare(a, b);

/** Période d'ajout : ce mois-ci, cette année, puis l'année. */
const addedPeriod = (iso: string | null, now: Date) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (date.getFullYear() !== now.getFullYear()) {
        return String(date.getFullYear());
    }
    return date.getMonth() === now.getMonth() ? 'month' : 'year';
};
const PERIOD_RANK = (key: string) =>
    key === 'month' ? 1e5 : key === 'year' ? 1e5 - 1 : Number(key);

/**
 * Séries de l'accueil (sans celles du bloc « En cours ») rangées en blocs,
 * selon le groupement choisi ; les blocs vides n'apparaissent pas.
 */
export const groupSeries = <T extends Groupable>(
    series: T[],
    grouping: Grouping,
    {
        readers = [],
        now = new Date(),
    }: { readers?: FamilyReader[]; now?: Date } = {},
): HomeGroup<T>[] => {
    const groups = ((): HomeGroup<T>[] => {
        switch (grouping) {
            case 'format':
                return groupBy(
                    series,
                    (s) => s.format ?? null,
                    (key) => key ?? 'Sans format',
                    nullsLast((a: string, b: string) =>
                        a.localeCompare(b, 'fr'),
                    ),
                );
            case 'age':
                return groupBy(
                    series,
                    (s) => s.age ?? null,
                    (key) => (key === null ? 'Âge inconnu' : ageLabel(key)),
                    nullsLast((a: number, b: number) => a - b),
                );
            case 'letter':
                return groupBy(
                    series,
                    (s) => letterOf(s.name),
                    (key) => key,
                    // « # » (chiffres, signes) à la fin.
                    (a, b) =>
                        a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b),
                );
            case 'added':
                return groupBy(
                    series,
                    (s) => addedPeriod(s.lastAddedAt, now),
                    (key) =>
                        key === null
                            ? 'Date inconnue'
                            : key === 'month'
                              ? 'Ce mois-ci'
                              : key === 'year'
                                ? 'Cette année'
                                : key,
                    nullsLast(
                        (a: string, b: string) =>
                            PERIOD_RANK(b) - PERIOD_RANK(a),
                    ),
                );
            case 'reader': {
                // Une série lue par plusieurs est dans le bloc de chacun.
                const read = new Set(readers.flatMap((r) => r.seriesIds));
                return [
                    ...readers.map((reader) => {
                        const ids = new Set(reader.seriesIds);
                        return {
                            key: `reader-${reader.id}`,
                            title: `Lu par ${reader.name}`,
                            list: series.filter((s) => ids.has(s.id)),
                        };
                    }),
                    {
                        key: 'nobody',
                        title: readers.length
                            ? 'Lues par personne d’autre'
                            : 'Séries',
                        list: series.filter((s) => !read.has(s.id)),
                    },
                ];
            }
            case 'none':
                return [{ key: 'all', title: null, list: series }];
            default:
                return [
                    {
                        key: 'unread',
                        title: 'À découvrir',
                        list: series.filter(
                            (s) => readingStateOf(s) !== 'read',
                        ),
                    },
                    {
                        key: 'read',
                        title: 'Déjà lues',
                        list: series.filter(
                            (s) => readingStateOf(s) === 'read',
                        ),
                    },
                ];
        }
    })();
    return groups.filter((group) => group.list.length > 0);
};
