import { tooManyRequests } from '../tools/errors';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

/**
 * Essais de connexion ratés, par identifiant : après 5 échecs en 15 min,
 * il faut attendre la fin de ces 15 min.
 */
export class LoginLimiter {
    private readonly failures = new Map<string, number[]>();

    constructor(private readonly now = () => Date.now()) {}

    private recent(key: string) {
        const since = this.now() - WINDOW_MS;
        const list = (this.failures.get(key) ?? []).filter((t) => t > since);
        if (list.length) this.failures.set(key, list);
        else this.failures.delete(key);
        return list;
    }

    /** Erreur 429 si cet identifiant a trop d'échecs récents. */
    check(key: string) {
        const list = this.recent(key);
        if (list.length >= MAX_FAILURES) {
            const minutes = Math.ceil(
                (list[0]! + WINDOW_MS - this.now()) / 60_000,
            );
            throw tooManyRequests(
                `Trop d'essais. Réessaie dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
            );
        }
    }

    fail(key: string) {
        this.failures.set(key, [...this.recent(key), this.now()]);
    }

    succeed(key: string) {
        this.failures.delete(key);
    }
}
