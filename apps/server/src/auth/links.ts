import { and, asc, eq, gt, isNull, lt } from 'drizzle-orm';

import type { Db } from '../db';
import { invitations, users } from '../db/schema';
import { badRequest, notFound } from '../tools/errors';
import { hashPassword } from './passwords';
import { type Role, hashToken, randomToken } from './sessions';
import {
    checkPassword,
    checkUsernameFree,
    optionalEmail,
    parseUsername,
    suggestUsername,
} from './users';

/** Durée de validité d'un lien. */
export const LINK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * - `invite` : nouveau compte ;
 * - `activate` : compte venu de Pocket ID, sans identifiant ni mot de passe ;
 * - `reset` : nouveau mot de passe.
 */
export type LinkKind = 'invite' | 'activate' | 'reset';

const insertLink = (
    db: Db,
    values: { userId?: number; role?: Role; maxAge?: number | null },
) => {
    // Au passage, oublier les liens expirés.
    db.delete(invitations).where(lt(invitations.expiresAt, new Date())).run();
    const token = randomToken();
    const expiresAt = new Date(Date.now() + LINK_DAYS * DAY_MS);
    const { id } = db
        .insert(invitations)
        .values({ ...values, tokenHash: hashToken(token), expiresAt })
        .returning({ id: invitations.id })
        .get();
    return { id, token, expiresAt };
};

/** Invitation à créer un compte de ce rôle et de cet âge maximal. */
export const createInvitation = (
    db: Db,
    { role, maxAge }: { role: Role; maxAge: number | null },
) => insertLink(db, { role, maxAge: role === 'admin' ? null : maxAge });

/**
 * Lien d'activation (compte sans mot de passe) ou de nouveau mot de passe
 * d'un compte ; remplace le lien précédent de ce compte.
 */
export const createUserLink = (db: Db, userId: number) => {
    const user = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .get();
    if (!user) throw notFound('Compte introuvable');
    db.delete(invitations).where(eq(invitations.userId, userId)).run();
    return insertLink(db, { userId });
};

/** Invitations en attente (le lien lui-même n'est plus connu). */
export const listInvitations = (db: Db) =>
    db
        .select({
            id: invitations.id,
            role: invitations.role,
            maxAge: invitations.maxAge,
            createdAt: invitations.createdAt,
            expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .where(
            and(
                isNull(invitations.userId),
                gt(invitations.expiresAt, new Date()),
            ),
        )
        .orderBy(asc(invitations.createdAt))
        .all();

export const deleteInvitation = (db: Db, id: number) => {
    const deleted = db
        .delete(invitations)
        .where(and(eq(invitations.id, id), isNull(invitations.userId)))
        .returning({ id: invitations.id })
        .get();
    if (!deleted) throw notFound('Invitation introuvable');
};

const EXPIRED = 'Ce lien est invalide ou a expiré. Demande-en un nouveau.';

const findLink = (db: Db, token: string) => {
    const row = db
        .select({
            id: invitations.id,
            role: invitations.role,
            maxAge: invitations.maxAge,
            user: {
                id: users.id,
                name: users.name,
                username: users.username,
                email: users.email,
                avatarSeed: users.avatarSeed,
                passwordHash: users.passwordHash,
            },
        })
        .from(invitations)
        .leftJoin(users, eq(users.id, invitations.userId))
        .where(
            and(
                eq(invitations.tokenHash, hashToken(token)),
                gt(invitations.expiresAt, new Date()),
            ),
        )
        .get();
    if (!row) throw notFound(EXPIRED);
    const kind: LinkKind = !row.user
        ? 'invite'
        : row.user.passwordHash
          ? 'reset'
          : 'activate';
    return { ...row, kind };
};

/** Ce qu'affiche la page d'un lien (page publique). */
export const linkInfo = (db: Db, token: string) => {
    const { kind, user } = findLink(db, token);
    return {
        kind,
        // Compte existant : identifiant proposé, e-mail et avatar actuels.
        username: user
            ? user.username
                ? user.name
                : suggestUsername(db, user.name)
            : null,
        email: user?.email ?? null,
        avatarSeed: user?.avatarSeed ?? null,
    };
};

export type LinkForm = {
    username?: string;
    password: string;
    email?: string | null;
    avatarSeed?: string;
};

/**
 * Utilise un lien : crée le compte (invitation), l'active, ou change son
 * mot de passe. Le lien ne sert qu'une fois. Renvoie le compte à connecter.
 */
export const useLink = async (db: Db, token: string, form: LinkForm) => {
    const link = findLink(db, token);
    checkPassword(form.password);
    const passwordHash = await hashPassword(form.password);

    if (link.kind === 'reset') {
        return db.transaction((tx) => {
            // Utilisé entre-temps ?
            findLink(tx as unknown as Db, token);
            tx.update(users)
                .set({ passwordHash })
                .where(eq(users.id, link.user!.id))
                .run();
            tx.delete(invitations).where(eq(invitations.id, link.id)).run();
            return { id: link.user!.id, kind: link.kind };
        });
    }

    if (!form.username) throw badRequest('Choisis un identifiant');
    const { name, username } = parseUsername(form.username);
    const account = {
        name,
        username,
        passwordHash,
        // Sans e-mail envoyé, celui du compte est gardé.
        email:
            form.email === undefined
                ? (link.user?.email ?? null)
                : optionalEmail(form.email),
        avatarSeed: form.avatarSeed ?? link.user?.avatarSeed ?? null,
        lastLoginAt: new Date(),
    };
    return db.transaction((tx) => {
        const db = tx as unknown as Db;
        findLink(db, token);
        checkUsernameFree(db, username, link.user?.id);
        tx.delete(invitations).where(eq(invitations.id, link.id)).run();
        if (link.user) {
            tx.update(users)
                .set(account)
                .where(eq(users.id, link.user.id))
                .run();
            return { id: link.user.id, kind: link.kind };
        }
        const { id } = tx
            .insert(users)
            .values({ ...account, role: link.role, maxAge: link.maxAge })
            .returning({ id: users.id })
            .get();
        return { id, kind: link.kind };
    });
};

/**
 * Secours : si aucun admin ne peut se connecter (pas de mot de passe), un
 * lien pour le premier admin, ou une invitation d'admin s'il n'y a aucun
 * compte. `undefined` si un admin a déjà un mot de passe.
 */
export const recoveryLink = (db: Db) => {
    const admins = db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.role, 'admin'))
        .orderBy(asc(users.id))
        .all();
    if (admins.some((admin) => admin.passwordHash)) return undefined;
    if (admins[0]) return createUserLink(db, admins[0].id).token;
    const anyone = db.select({ id: users.id }).from(users).get();
    if (anyone) return undefined;
    // Aucun compte : les invitations restantes viennent des démarrages
    // précédents.
    db.delete(invitations).run();
    return createInvitation(db, { role: 'admin', maxAge: null }).token;
};

/** Lien de secours pour un admin donné (commande `admin-link`). */
export const adminLink = (db: Db, rawUsername?: string) => {
    const admins = db
        .select({ id: users.id, name: users.name, username: users.username })
        .from(users)
        .where(eq(users.role, 'admin'))
        .orderBy(asc(users.id))
        .all();
    const wanted = rawUsername?.trim().toLocaleLowerCase('fr');
    const admin = wanted
        ? admins.find((a) => a.username === wanted)
        : admins[0];
    if (!admin) return undefined;
    return { name: admin.name, token: createUserLink(db, admin.id).token };
};
