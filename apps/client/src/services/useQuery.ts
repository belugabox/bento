import { type DependencyList, useCallback, useEffect, useState } from 'react';

/**
 * Dernières réponses gardées en mémoire (le temps de l'onglet), par clé :
 * revenir sur une page l'affiche tout de suite, puis la met à jour. Un
 * changement de compte ou de vue recharge l'application, et vide donc ce
 * cache.
 */
const cache = new Map<string, unknown>();

/** Vide le cache (tests). */
export const clearQueryCache = () => cache.clear();

/**
 * Charge une donnée au montage et quand `deps` change. Une réponse arrivée
 * après un changement de `deps` est ignorée. Avec `cacheKey`, la dernière
 * réponse pour cette clé est montrée tout de suite (sans chargement), puis
 * remplacée par la nouvelle.
 */
export const useQuery = <T>(
    load: () => Promise<T>,
    deps: DependencyList,
    { cacheKey }: { cacheKey?: string } = {},
) => {
    const cached = () =>
        cacheKey !== undefined && cache.has(cacheKey)
            ? { value: cache.get(cacheKey) as T }
            : undefined;
    const [data, setData] = useState<T | undefined>(() => cached()?.value);
    const [error, setError] = useState<Error>();
    const [loading, setLoading] = useState(() => !cached());
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let current = true;
        const hit = cached();
        if (hit) setData(hit.value);
        else setLoading(true);
        setError(undefined);
        load()
            .then((value) => {
                if (cacheKey !== undefined && value !== undefined) {
                    cache.set(cacheKey, value);
                }
                if (current) setData(value);
            })
            .catch((e: Error) => current && setError(e))
            .finally(() => current && setLoading(false));
        return () => {
            current = false;
        };
        // `load` est recréée à chaque rendu : seules `deps` (et la clé)
        // comptent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, cacheKey, version]);

    const reload = useCallback(() => setVersion((v) => v + 1), []);

    return { data, error, loading, reload };
};
