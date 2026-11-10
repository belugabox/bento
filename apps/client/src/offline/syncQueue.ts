import { saveProgress, sendReadingTime } from '@/services/api';
import { NetworkError, isOnline } from '@/services/network';

/**
 * Lecture faite sans réseau, gardée sur l'appareil puis envoyée au retour du
 * réseau, avec son heure réelle : le serveur garde la plus récente.
 */
type Pending =
    | {
          type: 'progress';
          userId: number;
          volumeId: number;
          page?: number;
          completed?: boolean;
          at: number;
      }
    | {
          type: 'time';
          userId: number;
          volumeId: number;
          seconds: number;
          pages: number;
          at: number;
      };

const KEY = 'bento:pending';

const read = (): Pending[] => {
    try {
        return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Pending[];
    } catch {
        return [];
    }
};

const write = (items: Pending[]) => {
    try {
        if (items.length) localStorage.setItem(KEY, JSON.stringify(items));
        else localStorage.removeItem(KEY);
    } catch {
        // Stockage refusé : cette lecture ne sera pas envoyée.
    }
};

/** Nombre d'envois en attente. */
export const pendingCount = () => read().length;

/**
 * Garde un envoi pour plus tard. Pour la progression, seul le dernier
 * d'un tome compte : les précédents sont remplacés.
 */
export const queue = (item: Pending) => {
    const items = read();
    write(
        item.type === 'progress'
            ? [
                  ...items.filter(
                      (i) =>
                          !(
                              i.type === 'progress' &&
                              i.volumeId === item.volumeId &&
                              i.userId === item.userId
                          ),
                  ),
                  item,
              ]
            : [...items, item],
    );
};

/** Vide la file (déconnexion). */
export const clearQueue = () => write([]);

let flushing = false;

/**
 * Envoie la file de la personne, dans l'ordre ; s'arrête au premier envoi
 * sans réseau (gardé avec les suivants). Un envoi refusé (tome disparu,
 * masqué) est oublié. Celles d'un autre compte sont oubliées.
 */
export const flushQueue = async (userId: number) => {
    if (flushing) return;
    flushing = true;
    try {
        let items = read().filter((i) => i.userId === userId);
        write(items);
        while (items.length) {
            const item = items[0]!;
            try {
                if (item.type === 'progress') {
                    await saveProgress(item.volumeId, {
                        page: item.page,
                        completed: item.completed,
                        at: item.at,
                    });
                } else {
                    await sendReadingTime(item.volumeId, {
                        seconds: item.seconds,
                        pages: item.pages,
                        at: item.at,
                    });
                }
            } catch (e) {
                if (e instanceof NetworkError) break;
            }
            // Envoyé (ou refusé) : retiré, en relisant la file (de nouveaux
            // envois ont pu s'y ajouter entre-temps).
            items = read().filter((i) => !same(i, item));
            write(items);
        }
    } finally {
        flushing = false;
    }
};

const same = (a: Pending, b: Pending) =>
    a.type === b.type && a.volumeId === b.volumeId && a.at === b.at;

/**
 * Progression d'un tome : envoyée tout de suite, ou gardée pour plus tard
 * sans réseau.
 */
export const saveProgressOrQueue = async (
    userId: number,
    volumeId: number,
    progress: { page?: number; completed?: boolean },
) => {
    const at = Date.now();
    if (!isOnline()) {
        queue({ type: 'progress', userId, volumeId, ...progress, at });
        return;
    }
    try {
        await saveProgress(volumeId, progress);
    } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        queue({ type: 'progress', userId, volumeId, ...progress, at });
    }
};

/** Temps de lecture : envoyé tout de suite, ou gardé pour plus tard. */
export const sendReadingTimeOrQueue = async (
    userId: number,
    volumeId: number,
    time: { seconds: number; pages: number },
) => {
    const at = Date.now();
    if (!isOnline()) {
        queue({ type: 'time', userId, volumeId, ...time, at });
        return;
    }
    try {
        await sendReadingTime(volumeId, time);
    } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        queue({ type: 'time', userId, volumeId, ...time, at });
    }
};
