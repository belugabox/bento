import { compareNames } from '@server/types';

/** Séries à classer : sans format ou sans âge, par nom. */
export const toClassify = <
    T extends { name: string; formatId: number | null; age: number | null },
>(
    series: T[],
) =>
    series
        .filter((s) => !s.formatId || s.age === null)
        .sort((a, b) => compareNames(a.name, b.name));

/**
 * Série suivante dans la liste, après `current` (par nom) ; la première
 * si `current` est la dernière, aucune s'il n'y a qu'elle.
 */
export const nextToClassify = <T extends { id: number; name: string }>(
    queue: T[],
    current: { id: number; name: string },
) => {
    const others = queue.filter((s) => s.id !== current.id);
    return (
        others.find((s) => compareNames(s.name, current.name) > 0) ?? others[0]
    );
};
