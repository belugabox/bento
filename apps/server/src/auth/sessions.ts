import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';

import type { Db } from '../db';
import { sessions, users } from '../db/schema';

export type Role = 'admin' | 'reader';

export type SessionUser = {
    id: number;
    name: string;
    username: string | null;
    email: string | null;
    avatarSeed: string | null;
    // Faux pour un compte venu de Pocket ID, pas encore activé.
    hasPassword: boolean;
    role: Role;
    maxAge: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 30;
// Une session utilisée à moins de 15 jours de son expiration est prolongée.
const RENEW_BELOW_MS = 15 * DAY_MS;

/** Chaîne aléatoire URL-safe (jetons de session et des liens). */
export const randomToken = (bytes = 32) =>
    randomBytes(bytes).toString('base64url');

/** Empreinte d'un jeton, seule gardée en base. */
export const hashToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');

const hash = hashToken;

/** Ouvre une session ; renvoie le jeton à mettre dans le cookie. */
export const createSession = (db: Db, userId: number) => {
    const token = randomToken();
    // Au passage, oublier les sessions expirées.
    db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
    db.insert(sessions)
        .values({
            id: hash(token),
            userId,
            expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS),
        })
        .run();
    return token;
};

/** Personne connectée pour ce jeton, ou `undefined` (absent ou expiré). */
export const userForSession = (
    db: Db,
    token: string,
): SessionUser | undefined => {
    const row = db
        .select({
            expiresAt: sessions.expiresAt,
            user: {
                id: users.id,
                name: users.name,
                username: users.username,
                email: users.email,
                avatarSeed: users.avatarSeed,
                hasPassword: sql<boolean>`${users.passwordHash} is not null`,
                role: users.role,
                maxAge: users.maxAge,
            },
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
            and(
                eq(sessions.id, hash(token)),
                gt(sessions.expiresAt, new Date()),
            ),
        )
        .get();
    if (!row) return undefined;
    if (row.expiresAt.getTime() - Date.now() < RENEW_BELOW_MS) {
        db.update(sessions)
            .set({ expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS) })
            .where(eq(sessions.id, hash(token)))
            .run();
    }
    return { ...row.user, hasPassword: Boolean(row.user.hasPassword) };
};

export const deleteSession = (db: Db, token: string) =>
    db
        .delete(sessions)
        .where(eq(sessions.id, hash(token)))
        .run();
