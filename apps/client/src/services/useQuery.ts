import { type DependencyList, useCallback, useEffect, useState } from 'react';

/**
 * Charge une donnée au montage et quand `deps` change. Une réponse arrivée
 * après un changement de `deps` est ignorée.
 */
export const useQuery = <T>(load: () => Promise<T>, deps: DependencyList) => {
    const [data, setData] = useState<T>();
    const [error, setError] = useState<Error>();
    const [loading, setLoading] = useState(true);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let current = true;
        setLoading(true);
        setError(undefined);
        load()
            .then((value) => current && setData(value))
            .catch((e: Error) => current && setError(e))
            .finally(() => current && setLoading(false));
        return () => {
            current = false;
        };
        // `load` est recréée à chaque rendu : seules `deps` comptent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, version]);

    const reload = useCallback(() => setVersion((v) => v + 1), []);

    return { data, error, loading, reload };
};
