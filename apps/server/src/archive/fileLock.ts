import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';

/** Dernière opération en cours ou en attente, par fichier. */
const queues = new Map<string, Promise<unknown>>();
/** Fichiers déjà verrouillés par l'opération en cours. */
const held = new AsyncLocalStorage<ReadonlySet<string>>();

/**
 * Exécute `task` quand les opérations précédentes sur le même fichier sont
 * finies. Deux écritures simultanées d'un tome (enregistrement du ComicInfo,
 * compression, réparation) écriraient sinon au même endroit, ou l'une
 * effacerait l'autre. Une opération qui tient déjà le verrou (compression
 * qui répare l'archive) le reprend sans attendre.
 */
export const withFileLock = async <T>(
    fullPath: string,
    task: () => Promise<T>,
): Promise<T> => {
    const key = path.resolve(fullPath);
    const keys = held.getStore() ?? new Set<string>();
    if (keys.has(key)) return task();
    const previous = queues.get(key) ?? Promise.resolve();
    const current = previous
        .catch(() => {})
        .then(() => held.run(new Set([...keys, key]), task));
    queues.set(key, current);
    try {
        return await current;
    } finally {
        // Personne n'attend derrière : le fichier est libre.
        if (queues.get(key) === current) queues.delete(key);
    }
};
