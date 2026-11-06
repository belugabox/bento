/**
 * Âge minimal de chaque classification ComicInfo (`AgeRating`).
 * « Unknown » et « Rating Pending » n'en ont pas : la série est alors
 * masquée aux comptes limités.
 */
export const AGE_RATINGS = {
    Everyone: 0,
    G: 0,
    'Early Childhood': 0,
    'Kids to Adults': 6,
    'Everyone 10+': 10,
    PG: 10,
    Teen: 13,
    'MA15+': 15,
    M: 17,
    'Mature 17+': 17,
    'R18+': 18,
    'Adults Only 18+': 18,
    'X18+': 18,
} as const;

export type AgeRating = keyof typeof AGE_RATINGS;

export const isAgeRating = (value: unknown): value is AgeRating =>
    typeof value === 'string' && Object.hasOwn(AGE_RATINGS, value);

/**
 * Classification ComicInfo pour un âge (« 12+ »), arrondie vers la plus
 * stricte : un « 12+ » devient « Teen » (13 ans), faute d'une classe à 12.
 * Bento garde l'âge exact ; le ComicInfo sert aux autres lecteurs.
 */
export const ratingForAge = (age: number): AgeRating =>
    age <= 0
        ? 'Everyone'
        : age <= 6
          ? 'Kids to Adults'
          : age <= 10
            ? 'Everyone 10+'
            : age <= 13
              ? 'Teen'
              : age <= 15
                ? 'MA15+'
                : age <= 17
                  ? 'Mature 17+'
                  : 'Adults Only 18+';

/** Âge minimal d'une classification, ou `null` si elle est inconnue. */
export const minAgeOf = (rating: string | null | undefined): number | null =>
    isAgeRating(rating) ? AGE_RATINGS[rating] : null;

/**
 * Classification d'une série et âge minimal correspondant : la plus
 * restrictive de ses tomes (un seul tome pour adultes suffit).
 */
export const seriesAge = (
    volumeRatings: (string | null | undefined)[],
): { ageRating: string | null; minAge: number | null } => {
    let strictest: { ageRating: string; minAge: number } | undefined;
    for (const rating of volumeRatings) {
        const age = minAgeOf(rating);
        if (age !== null && (!strictest || age > strictest.minAge)) {
            strictest = { ageRating: rating!, minAge: age };
        }
    }
    return (
        strictest ?? {
            ageRating: volumeRatings.find((r) => r) ?? null,
            minAge: null,
        }
    );
};
