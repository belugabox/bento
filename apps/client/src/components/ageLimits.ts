import { useEffect, useState } from 'react';

import {
    DEFAULT_AGE_STEPS,
    ageLabel,
    minAgeOf,
    ratingForAge,
} from '@server/types';

import { fetchSettings } from '@/services/api';

export { ageLabel, ratingForAge };

/**
 * Âge d'une série : celui choisi dans Bento, sinon celui déduit de la
 * classification ComicInfo de ses tomes ; null = inconnu.
 */
export const seriesAgeOf = (series: {
    age: number | null;
    fileAge?: number | null;
}) => series.age ?? series.fileAge ?? null;

/** Âge d'une classification ComicInfo (« Teen » : 13), ou null. */
export const ageOfRating = (rating: string | null | undefined) =>
    minAgeOf(rating);

// Grille d'âges des réglages, chargée une fois (pages de l'admin).
let steps: number[] | undefined;
let loading: Promise<number[]> | undefined;
const listeners = new Set<(steps: number[]) => void>();

/** Nouvelle grille enregistrée : les écrans ouverts la reprennent. */
export const setAgeSteps = (next: number[]) => {
    steps = next;
    for (const listener of listeners) listener(next);
};

/**
 * Grille d'âges réglée par l'admin (« Tout public, 8+, 10+… »), la grille
 * de départ en attendant. Chargée seulement si `enabled` (réglages réservés
 * aux admins).
 */
export const useAgeSteps = (enabled = true) => {
    const [current, setCurrent] = useState(steps ?? DEFAULT_AGE_STEPS);
    useEffect(() => {
        if (!enabled) return;
        listeners.add(setCurrent);
        if (!steps) {
            loading ??= fetchSettings().then((r) => r.settings.ages);
            loading.then(setAgeSteps).catch(() => {
                loading = undefined;
            });
        }
        return () => {
            listeners.delete(setCurrent);
        };
    }, [enabled]);
    return current;
};

/** Choix d'âge d'une série, d'après la grille (et l'âge actuel s'il en sort). */
export const ageOptions = (grid: number[], current?: number | null) =>
    [...new Set([...grid, ...(current == null ? [] : [current])])]
        .sort((a, b) => a - b)
        .map((age) => ({ value: String(age), label: ageLabel(age) }));

/** Libellé d'un âge maximal de compte. */
export const ageLimitLabel = (maxAge: number | null) =>
    maxAge === null
        ? 'Sans limite'
        : maxAge === 0
          ? 'Tout public uniquement'
          : `Jusqu’à ${maxAge} ans`;

/**
 * Choix d'âge maximal d'un compte (contrôle parental, vue lecteur), d'après
 * la grille ; `null` : sans limite.
 */
export const ageLimitOptions = (grid: number[], current?: number | null) =>
    [
        null,
        ...[...new Set([...grid, ...(current == null ? [] : [current])])].sort(
            (a, b) => a - b,
        ),
    ].map((value) => ({ value, label: ageLimitLabel(value) }));
