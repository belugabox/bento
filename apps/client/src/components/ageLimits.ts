import { AGE_RATINGS } from '@server/types';

/**
 * Classifications regroupées par âge : le ComicInfo en a plusieurs
 * variantes (« Everyone 10+ » et « PG » pour 10 ans…). Choisir un groupe
 * enregistre sa classification de référence.
 */
export const AGE_GROUPS = [
    { age: 0, label: 'Tout public', rating: 'Everyone' },
    { age: 6, label: '6 ans et +', rating: 'Kids to Adults' },
    { age: 10, label: '10 ans et +', rating: 'Everyone 10+' },
    { age: 13, label: '13 ans et +', rating: 'Teen' },
    { age: 15, label: '15 ans et +', rating: 'MA15+' },
    { age: 17, label: '17 ans et +', rating: 'Mature 17+' },
    { age: 18, label: '18 ans et +', rating: 'Adults Only 18+' },
] as const;

const groupOf = (rating: string | null | undefined) => {
    const age = rating
        ? AGE_RATINGS[rating as keyof typeof AGE_RATINGS]
        : undefined;
    return age === undefined
        ? undefined
        : AGE_GROUPS.find((g) => g.age === age);
};

/** Choix d'une classification (un par âge). */
export const AGE_RATING_OPTIONS = AGE_GROUPS.map((g) => ({
    value: g.rating,
    label: g.label,
}));

/** Classification de référence du groupe d'une classification. */
export const canonicalRating = (rating: string | null | undefined) =>
    groupOf(rating)?.rating ?? null;

/** Libellé d'une classification (« 10 ans et + »), ou null si inconnue. */
export const ageRatingLabel = (rating: string | null | undefined) =>
    groupOf(rating)?.label ?? null;

/** Choix d'âge maximal d'un compte (contrôle parental, vue lecteur). */
export const AGE_LIMITS: { value: number | null; label: string }[] = [
    { value: null, label: 'Sans limite' },
    { value: 0, label: 'Tout public uniquement' },
    { value: 6, label: 'Jusqu’à 6 ans' },
    { value: 10, label: 'Jusqu’à 10 ans' },
    { value: 13, label: 'Jusqu’à 13 ans' },
    { value: 15, label: 'Jusqu’à 15 ans' },
    { value: 17, label: 'Jusqu’à 17 ans' },
];

/** Libellé d'un âge maximal. */
export const ageLimitLabel = (maxAge: number | null) =>
    AGE_LIMITS.find((limit) => limit.value === maxAge)?.label ??
    `Jusqu’à ${maxAge} ans`;
