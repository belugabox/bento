import { Hono } from 'hono';
import { z } from 'zod';

import {
    createReaderInvite,
    deleteReaderInvite,
    listReaderInvites,
} from './auth/readerInvites';
import { type AuthEnv, requireAdmin } from './auth/routes';
import { approveUser, pendingUserCount } from './auth/users';
import type { Db } from './db';
import type { SettingsStore } from './settings';
import { forbidden } from './tools/errors';
import { zValidator } from './tools/validator';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const maxAge = z.number().int().min(0).max(18).nullable();

/**
 * Invitations des lecteurs et validation de leurs invités par l'admin, à
 * part de `api.ts` : sa chaîne de routes est trop longue pour TypeScript.
 */
export const createInvitationRoutes = (db: Db, settings: SettingsStore) => {
    const checkOpen = () => {
        if (!settings.get().readersCanInvite) {
            throw forbidden('Les invitations des lecteurs sont fermées');
        }
    };
    return (
        new Hono<AuthEnv>()
            // Les invitations du lecteur connecté.
            .get('/me/invitations', (c) =>
                c.json(listReaderInvites(db, c.var.user.id)),
            )
            .post(
                '/me/invitations',
                zValidator(
                    'json',
                    z.object({
                        maxAge,
                        username: z.string().max(100).nullable().optional(),
                    }),
                ),
                (c) => {
                    checkOpen();
                    // Vue lecteur d'un admin : il invite depuis Comptes.
                    if (c.var.preview) {
                        throw forbidden('Vue lecteur : invite depuis Comptes');
                    }
                    const { id, token, expiresAt } = createReaderInvite(
                        db,
                        c.var.user,
                        c.req.valid('json'),
                    );
                    return c.json({ id, token, expiresAt });
                },
            )
            .delete(
                '/me/invitations/:id',
                zValidator('param', idParam),
                (c) => {
                    deleteReaderInvite(
                        db,
                        c.var.user.id,
                        c.req.valid('param').id,
                    );
                    return c.json({ ok: true as const });
                },
            )
            // Comptes invités par des lecteurs, à valider (admin).
            .get('/users/pending', requireAdmin, (c) =>
                c.json({ count: pendingUserCount(db) }),
            )
            .post(
                '/users/:id/approve',
                requireAdmin,
                zValidator('param', idParam),
                zValidator('json', z.object({ maxAge })),
                (c) =>
                    c.json(
                        approveUser(
                            db,
                            c.req.valid('param').id,
                            c.req.valid('json').maxAge,
                        ),
                    ),
            )
    );
};
