import { sql } from 'drizzle-orm';

import type { SessionUser } from '../auth/sessions';
import { series } from '../db/schema';

/** Personne qui consulte le catalogue. */
export type Viewer = Pick<SessionUser, 'id' | 'role' | 'maxAge'>;

/** Âge maximal des séries visibles ; `null` = tout (admins compris). */
export const ageLimit = (viewer: Viewer) =>
    viewer.role === 'admin' ? null : viewer.maxAge;

/**
 * Condition sur `series` : séries visibles pour la personne. Un compte
 * limité ne voit que les séries d'âge connu (choisi dans Bento, sinon
 * déduit des tomes), sous sa limite.
 */
export const visibleTo = (viewer: Viewer) => {
    const limit = ageLimit(viewer);
    return limit === null
        ? undefined
        : sql`coalesce(${series.age}, ${series.minAge}) <= ${limit}`;
};
