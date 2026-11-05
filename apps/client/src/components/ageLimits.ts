import { AGE_RATINGS } from '@server/types';

/** Choix d'âge maximal d'un compte (contrôle parental). */
export const AGE_LIMITS: { value: number | null; label: string }[] = [
    { value: null, label: 'Sans limite' },
    { value: 0, label: 'Tout public uniquement' },
    { value: 6, label: 'Jusqu’à 6 ans' },
    { value: 10, label: 'Jusqu’à 10 ans' },
    { value: 13, label: 'Jusqu’à 13 ans' },
    { value: 15, label: 'Jusqu’à 15 ans' },
    { value: 17, label: 'Jusqu’à 17 ans' },
];

/** Classifications ComicInfo, de la plus permissive à la plus stricte. */
export const AGE_RATING_OPTIONS = Object.entries(AGE_RATINGS)
    .sort(([, a], [, b]) => a - b)
    .map(([rating, age]) => ({
        value: rating,
        label: `${rating} (${age === 0 ? 'tout public' : `${age} ans et +`})`,
    }));
