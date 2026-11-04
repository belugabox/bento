import { and, eq, gt, lt } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import type { Db } from '../db';
import { sessions, users } from '../db/schema';
import { randomToken } from './oidc';
import type { OidcUser } from './oidc';

export type Role = 'admin' | 'reader';

export type SessionUser = {
    id: number;
    name: string;
    email: string | null;
    role: Role;
    maxAgeRating: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 30;
// Une session utilisée à moins de 15 jours de son expiration est prolongée.
const RENEW_BELOW_MS = 15 * DAY_MS;

const hash = (token: string) =>
    createHash('sha256').update(token).digest('hex');

/** Rôle donné par les groupes Pocket ID, ou `undefined` (accès refusé). */
export const roleFromGroups = (
    groups: string[],
    { adminGroup, readerGroup }: { adminGroup: string; readerGroup: string },
): Role | undefined =>
    groups.includes(adminGroup)
        ? 'admin'
        : groups.includes(readerGroup)
          ? 'reader'
          : undefined;

/**
 * Crée ou met à jour le compte à la connexion. Nom, e-mail et rôle suivent
 * Pocket ID ; la classification d'âge, réglée dans Bento, est conservée.
 */
export const upsertUser = (db: Db, user: OidcUser, role: Role) =>
    db
        .insert(users)
        .values({
            oidcSubject: user.sub,
            name: user.name,
            email: user.email ?? null,
            role,
            lastLoginAt: new Date(),
        })
        .onConflictDoUpdate({
            target: users.oidcSubject,
            set: {
                name: user.name,
                email: user.email ?? null,
                role,
                lastLoginAt: new Date(),
            },
        })
        .returning({ id: users.id })
        .get();

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
                email: users.email,
                role: users.role,
                maxAgeRating: users.maxAgeRating,
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
    return row.user;
};

export const deleteSession = (db: Db, token: string) =>
    db
        .delete(sessions)
        .where(eq(sessions.id, hash(token)))
        .run();
