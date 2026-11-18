import { and, asc, eq, gt, isNotNull, isNull } from 'drizzle-orm';

import type { Db } from '../db';
import { invitations, users } from '../db/schema';
import { forbidden, notFound } from '../tools/errors';
import { createInvitation } from './links';
import type { SessionUser } from './sessions';

/**
 * Invitations envoyées par un lecteur (demandé, « avec validation par
 * l'admin ») : même lien que celles de l'admin (7 jours, une fois), mais le
 * compte créé attend l'admin avant de pouvoir se connecter.
 */

/** Liens pas encore utilisés et comptes en attente, par lecteur. */
export const MAX_READER_INVITES = 2;

/** Invitations d'un lecteur : liens en cours et comptes à valider. */
export const listReaderInvites = (db: Db, userId: number) => ({
    links: db
        .select({
            id: invitations.id,
            username: invitations.username,
            maxAge: invitations.maxAge,
            createdAt: invitations.createdAt,
            expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .where(
            and(
                eq(invitations.invitedBy, userId),
                isNull(invitations.userId),
                gt(invitations.expiresAt, new Date()),
            ),
        )
        .orderBy(asc(invitations.createdAt))
        .all(),
    pending: db
        .select({
            id: users.id,
            name: users.name,
            avatarSeed: users.avatarSeed,
            pendingSince: users.pendingSince,
        })
        .from(users)
        .where(and(eq(users.invitedBy, userId), isNotNull(users.pendingSince)))
        .orderBy(asc(users.pendingSince))
        .all(),
    max: MAX_READER_INVITES,
});

/**
 * Nouvelle invitation d'un lecteur : un compte de lecteur, jamais plus
 * permis que le sien (âge maximal au plus le sien).
 */
export const createReaderInvite = (
    db: Db,
    inviter: SessionUser,
    { maxAge, username }: { maxAge: number | null; username?: string | null },
) => {
    if (inviter.role !== 'reader') {
        throw forbidden('Les admins invitent depuis la page Comptes');
    }
    const { links, pending } = listReaderInvites(db, inviter.id);
    if (links.length + pending.length >= MAX_READER_INVITES) {
        throw forbidden(
            `${MAX_READER_INVITES} invitations au plus en attente : annule-en une, ou attends que l’admin valide les comptes.`,
        );
    }
    const limited =
        inviter.maxAge === null
            ? maxAge
            : Math.min(maxAge ?? inviter.maxAge, inviter.maxAge);
    return createInvitation(db, {
        role: 'reader',
        maxAge: limited,
        username,
        invitedBy: inviter.id,
    });
};

/** Un lecteur annule une de ses invitations. */
export const deleteReaderInvite = (db: Db, userId: number, id: number) => {
    const deleted = db
        .delete(invitations)
        .where(
            and(
                eq(invitations.id, id),
                eq(invitations.invitedBy, userId),
                isNull(invitations.userId),
            ),
        )
        .returning({ id: invitations.id })
        .get();
    if (!deleted) throw notFound('Invitation introuvable');
};
