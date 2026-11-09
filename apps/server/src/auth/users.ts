import { and, count, eq, isNotNull, ne, sql } from 'drizzle-orm';

import type { Db } from '../db';
import { users } from '../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../tools/errors';
import { hashPassword, verifyPassword } from './passwords';
import { PASSWORD_MIN_LENGTH, USERNAME_PATTERN, USERNAME_RULE } from './rules';
import type { Role } from './sessions';

/**
 * Identifiant tel que tapé, et sa forme de connexion (en minuscules) ;
 * erreur s'il ne convient pas.
 */
export const parseUsername = (raw: string) => {
    const name = raw.trim().normalize('NFC');
    if (!USERNAME_PATTERN.test(name)) {
        throw badRequest(`Identifiant : ${USERNAME_RULE.toLowerCase()}`);
    }
    return { name, username: name.toLocaleLowerCase('fr') };
};

export const checkPassword = (password: string) => {
    if (password.length < PASSWORD_MIN_LENGTH) {
        throw badRequest(
            `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères`,
        );
    }
};

/** Erreur si l'identifiant est déjà pris par un autre compte. */
export const checkUsernameFree = (
    db: Db,
    username: string,
    exceptId?: number,
) => {
    const taken = db
        .select({ id: users.id })
        .from(users)
        .where(
            and(
                eq(users.username, username),
                exceptId === undefined ? undefined : ne(users.id, exceptId),
            ),
        )
        .get();
    if (taken) throw conflict('Cet identifiant est déjà pris');
};

/** Identifiant libre proposé d'après un nom (« Benjamin Corbeel » → « Benjamin »). */
export const suggestUsername = (db: Db, name: string) => {
    const base =
        (name.trim().split(/\s+/)[0] ?? '')
            .normalize('NFC')
            .replace(/[^\p{L}\p{N}._-]/gu, '')
            .slice(0, 28) || 'lecteur';
    for (let i = 1; ; i++) {
        const candidate = i === 1 ? base : `${base}${i}`;
        if (candidate.length < 2) continue;
        const taken = db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, candidate.toLocaleLowerCase('fr')))
            .get();
        if (!taken) return candidate;
    }
};

/** E-mail facultatif : vide devient null. */
export const optionalEmail = (email: string | null | undefined) => {
    const value = email?.trim();
    return value ? value : null;
};

export const listUsers = (db: Db) =>
    db
        .select({
            id: users.id,
            name: users.name,
            username: users.username,
            email: users.email,
            avatarSeed: users.avatarSeed,
            role: users.role,
            maxAge: users.maxAge,
            // Faux : compte venu de Pocket ID, pas encore activé.
            hasPassword: sql<number>`${users.passwordHash} is not null`,
            lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .orderBy(sql`${users.name} collate nocase`)
        .all()
        .map((user) => ({ ...user, hasPassword: Boolean(user.hasPassword) }));

const adminCount = (db: Db) =>
    db.select({ n: count() }).from(users).where(eq(users.role, 'admin')).get()
        ?.n ?? 0;

/**
 * Âge maximal (`null` : sans limite) et rôle d'un compte. Un admin ne peut
 * pas se retirer lui-même le rôle d'admin.
 */
export const updateUser = (
    db: Db,
    id: number,
    changes: { maxAge?: number | null; role?: Role },
    actingUserId: number,
) => {
    if (changes.role === 'reader' && id === actingUserId) {
        throw forbidden('Tu ne peux pas retirer ton propre rôle d’admin');
    }
    const updated = db
        .update(users)
        .set(changes)
        .where(eq(users.id, id))
        .returning({ id: users.id, maxAge: users.maxAge, role: users.role })
        .get();
    if (!updated) throw notFound('Compte introuvable');
    return updated;
};

/** Supprime un compte, ses lectures et ses listes (pas le sien). */
export const deleteUser = (db: Db, id: number, actingUserId: number) => {
    if (id === actingUserId) {
        throw forbidden('Tu ne peux pas supprimer ton propre compte');
    }
    const user = db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, id))
        .get();
    if (!user) throw notFound('Compte introuvable');
    if (user.role === 'admin' && adminCount(db) <= 1) {
        throw forbidden('Il faut garder au moins un admin');
    }
    db.delete(users).where(eq(users.id, id)).run();
};

/**
 * Identifiant et mot de passe du compte qui se connecte, ou `undefined`.
 * Le mot de passe est vérifié même sans compte (même durée de réponse).
 */
export const findLogin = (db: Db, rawUsername: string) =>
    db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(
            and(
                eq(
                    users.username,
                    rawUsername.trim().normalize('NFC').toLocaleLowerCase('fr'),
                ),
                isNotNull(users.passwordHash),
            ),
        )
        .get();

export type AccountChanges = {
    username?: string;
    email?: string | null;
    avatarSeed?: string;
    password?: string;
    // Mot de passe actuel, exigé pour en changer quand il y en a un.
    currentPassword?: string;
};

/**
 * « Mon compte » : identifiant, e-mail, avatar et mot de passe. Un compte
 * venu de Pocket ID choisit ici son identifiant et son mot de passe.
 */
export const updateAccount = async (
    db: Db,
    id: number,
    changes: AccountChanges,
) => {
    const user = db
        .select({ username: users.username, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, id))
        .get();
    if (!user) throw notFound('Compte introuvable');

    const set: Partial<typeof users.$inferInsert> = {};
    if (changes.username !== undefined) {
        const { name, username } = parseUsername(changes.username);
        checkUsernameFree(db, username, id);
        Object.assign(set, { name, username });
    }
    if (changes.email !== undefined) set.email = optionalEmail(changes.email);
    if (changes.avatarSeed !== undefined) set.avatarSeed = changes.avatarSeed;
    if (changes.password !== undefined) {
        checkPassword(changes.password);
        if (
            user.passwordHash &&
            !(await verifyPassword(
                changes.currentPassword ?? '',
                user.passwordHash,
            ))
        ) {
            throw badRequest('Mot de passe actuel incorrect');
        }
        set.passwordHash = await hashPassword(changes.password);
    }
    // Pour activer un compte, il faut les deux.
    if (
        !user.passwordHash &&
        ((set.passwordHash && !(set.username ?? user.username)) ||
            (set.username && !set.passwordHash))
    ) {
        throw badRequest('Choisis un identifiant et un mot de passe');
    }
    if (Object.keys(set).length > 0) {
        db.update(users).set(set).where(eq(users.id, id)).run();
    }
};
