import { ageLabel, compareNames } from '@server/types';

import { ratingLabel } from '@/components/format';

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
    // Retirée des suggestions par la personne (« Pas pour moi »).
    notForMe?: boolean;
    // Note des lecteurs, sur 5, et son nombre d'avis (tri « Mieux notées »).
    rating?: number | null;
    ratingCount?: number;
    // Tomes ajoutés depuis la dernière lecture (pastille « +2 »).
    newCount?: number;
    // Dernière lecture de la personne dans la série (ms), tri « Lues
    // récemment ».
    lastReadAt?: number | null;
    year?: number | null;
    // Fin de parution (série finie), après `year`.
    endYear?: number | null;
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
export type SeriesSort = 'name' | 'recent' | 'lastRead' | 'rating' | 'year';

/** Tris de la bibliothèque (bouton « Affichage », en-têtes de la liste). */
export const SERIES_SORTS: { value: SeriesSort; label: string }[] = [
    { value: 'name', label: 'Nom' },
    { value: 'recent', label: 'Ajouts récents' },
    { value: 'lastRead', label: 'Lus récemment' },
    { value: 'rating', label: 'Mieux notés' },
    { value: 'year', label: 'Parution' },
];

export const isSeriesSort = (value: unknown): value is SeriesSort =>
    SERIES_SORTS.some((s) => s.value === value);

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
            s.year && s.endYear && s.endYear !== s.year
                ? `${s.year} – ${s.endYear}`
                : s.year,
            s.age !== null && s.age !== undefined ? ageLabel(s.age) : null,
            s.status ? STATUS_LABELS[s.status] : null,
            // Note des lecteurs (fiches en ligne).
            s.rating != null ? ratingLabel(s.rating) : null,
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

/** Les valeurs absentes à la fin, les plus grandes d'abord. */
const descending = (
    a: number | null | undefined,
    b: number | null | undefined,
) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : b - a);

/**
 * Séries triées pour la bibliothèque, sans rang de lecture : par nom (sans
 * les articles), par ajout ou lecture la plus récente, par note (la plus
 * donnée à note égale) ou par parution (la plus récente) ; les valeurs
 * absentes à la fin, puis par nom.
 */
export const sortSeries = <T extends ListedSeries>(
    series: T[],
    sort: SeriesSort,
): T[] =>
    [...series].sort(
        (a, b) =>
            (sort === 'recent'
                ? (b.lastAddedAt ?? '').localeCompare(a.lastAddedAt ?? '')
                : sort === 'lastRead'
                  ? descending(a.lastReadAt, b.lastReadAt)
                  : sort === 'rating'
                    ? descending(a.rating, b.rating) ||
                      (b.ratingCount ?? 0) - (a.ratingCount ?? 0)
                    : sort === 'year'
                      ? descending(a.year, b.year)
                      : 0) || compareNames(a.name, b.name),
    );
