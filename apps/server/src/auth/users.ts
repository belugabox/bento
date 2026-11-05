import { asc, eq } from 'drizzle-orm';

import type { Db } from '../db';
import { users } from '../db/schema';
import { notFound } from '../tools/errors';

export const listUsers = (db: Db) =>
    db
        .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            maxAge: users.maxAge,
            lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .orderBy(asc(users.name))
        .all();

/** Âge maximal des séries visibles par la personne (`null` : sans limite). */
export const setUserMaxAge = (db: Db, id: number, maxAge: number | null) => {
    const updated = db
        .update(users)
        .set({ maxAge })
        .where(eq(users.id, id))
        .returning({ id: users.id, maxAge: users.maxAge })
        .get();
    if (!updated) throw notFound('Compte introuvable');
    return updated;
};
