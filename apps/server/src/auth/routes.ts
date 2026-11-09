import { and, eq, ne, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';

import type { Db } from '../db';
import { users } from '../db/schema';
import { badRequest, forbidden, unauthorized } from '../tools/errors';
import type { Logger } from '../tools/logger';
import { zValidator } from '../tools/validator';
import { linkInfo, useLink } from './links';
import { LoginLimiter } from './loginLimiter';
import { decoyHash, verifyPassword } from './passwords';
import { isAvatarSeed } from './rules';
import {
    SESSION_DAYS,
    type SessionUser,
    createSession,
    deleteSession,
    userById,
    userForSession,
} from './sessions';
import { findLogin } from './users';

export type AuthEnv = {
    Variables: {
        // Personne telle que vue par le catalogue (lecteur en vue lecteur,
        // compte simulé).
        user: SessionUser;
        preview: Preview | null;
    };
};

export type AuthDeps = {
    db: Db;
    logger: Logger;
    publicUrl: string;
    /** Essais de connexion ratés (un nouveau si absent). */
    limiter?: LoginLimiter;
};

/**
 * Vue lecteur d'un admin : un lecteur de cet âge (null : sans limite), ou un
 * compte simulé (`user`), vu tel quel et en lecture seule.
 */
export type Preview = {
    maxAge: number | null;
    user?: { id: number; name: string };
};

const SESSION_COOKIE = 'bento_session';
// Vue lecteur d'un admin : âge maximal (« all » : sans limite), ou
// « user:N » pour simuler le compte N.
const PREVIEW_COOKIE = 'bento_preview';
const USER_PREFIX = 'user:';

/** Requêtes permises en simulation : lire, et changer de vue. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const linkForm = z.object({
    username: z.string().max(100).optional(),
    password: z.string().max(200),
    email: z
        .string()
        .trim()
        .email()
        .max(200)
        .or(z.literal(''))
        .nullable()
        .optional(),
    avatarSeed: z.string().refine(isAvatarSeed, 'Avatar invalide').optional(),
});

/** Connexion, déconnexion et liens d'invitation (montées sous `/auth`). */
export const createAuthRoutes = ({
    db,
    logger,
    publicUrl,
    limiter = new LoginLimiter(),
}: AuthDeps) => {
    // Cookies `Secure` dès que l'appli est servie en HTTPS.
    const secure = publicUrl.startsWith('https://');
    const openSession = (c: Context, userId: number) => {
        db.update(users)
            .set({ lastLoginAt: new Date() })
            .where(eq(users.id, userId))
            .run();
        setCookie(c, SESSION_COOKIE, createSession(db, userId), {
            httpOnly: true,
            secure,
            sameSite: 'Lax',
            path: '/',
            maxAge: SESSION_DAYS * 24 * 60 * 60,
        });
    };

    return (
        new Hono()
            .post(
                '/login',
                zValidator(
                    'json',
                    z.object({
                        username: z.string().min(1).max(100),
                        password: z.string().min(1).max(200),
                    }),
                ),
                async (c) => {
                    const { username, password } = c.req.valid('json');
                    const key = username.trim().toLocaleLowerCase('fr');
                    limiter.check(key);
                    const account = findLogin(db, username);
                    const ok = await verifyPassword(
                        password,
                        account?.passwordHash ?? (await decoyHash()),
                    );
                    if (!account || !ok) {
                        limiter.fail(key);
                        logger.info(`Connexion refusée pour « ${username} »`);
                        // 400 et non 401 : le client renvoie les 401 vers cette page.
                        throw badRequest(
                            'Identifiant ou mot de passe incorrect',
                        );
                    }
                    limiter.succeed(key);
                    openSession(c, account.id);
                    logger.info(`Connexion de ${username}`);
                    return c.json({ ok: true as const });
                },
            )
            .post('/logout', (c) => {
                const token = getCookie(c, SESSION_COOKIE);
                if (token) deleteSession(db, token);
                deleteCookie(c, SESSION_COOKIE, { path: '/' });
                return c.json({ ok: true as const });
            })
            // Lien d'invitation, d'activation ou de nouveau mot de passe.
            .get('/links/:token', (c) =>
                c.json(linkInfo(db, c.req.param('token'))),
            )
            .post('/links/:token', zValidator('json', linkForm), async (c) => {
                const { id, kind } = await useLink(
                    db,
                    c.req.param('token'),
                    c.req.valid('json'),
                );
                openSession(c, id);
                logger.info(
                    kind === 'invite'
                        ? `Nouveau compte ${id}`
                        : kind === 'activate'
                          ? `Compte ${id} activé`
                          : `Nouveau mot de passe pour le compte ${id}`,
                );
                return c.json({ kind });
            })
    );
};

/** Exige une session valide ; la personne connectée est dans `c.var.user`. */
export const requireUser = (db: Db) =>
    createMiddleware<AuthEnv>(async (c, next) => {
        const token = getCookie(c, SESSION_COOKIE);
        const user = token ? userForSession(db, token) : undefined;
        if (!user) throw unauthorized('Connexion requise');
        const cookie =
            user.role === 'admin' ? getCookie(c, PREVIEW_COOKIE) : undefined;
        const simulated = simulatedUser(db, cookie, user.id);
        if (simulated) {
            // Compte simulé : vu tel quel, sans rien pouvoir changer.
            c.set('preview', {
                maxAge: simulated.maxAge,
                user: { id: simulated.id, name: simulated.name },
            });
            c.set('user', simulated);
            if (
                !READ_METHODS.has(c.req.method) &&
                !c.req.path.endsWith('/preview')
            ) {
                throw forbidden(
                    `Vue de ${simulated.name} : lecture seule, rien n’est enregistré.`,
                );
            }
            return next();
        }
        const preview = previewOf(cookie);
        c.set('preview', preview);
        // En vue lecteur, l'admin voit et agit comme un lecteur de cet âge.
        c.set(
            'user',
            preview
                ? { ...user, role: 'reader', maxAge: preview.maxAge }
                : user,
        );
        await next();
    });

/** Lecteur simulé par l'admin `adminId` (jamais lui-même ni un admin). */
const simulatedUser = (
    db: Db,
    value: string | undefined,
    adminId: number,
): SessionUser | undefined => {
    if (!value?.startsWith(USER_PREFIX)) return undefined;
    const id = Number(value.slice(USER_PREFIX.length));
    if (!Number.isInteger(id) || id === adminId) return undefined;
    const user = userById(db, id);
    return user?.role === 'reader' ? user : undefined;
};

/** Comptes qu'un admin peut simuler : les lecteurs. */
const simulableAccounts = (db: Db, adminId: number) =>
    db
        .select({
            id: users.id,
            name: users.name,
            avatarSeed: users.avatarSeed,
            maxAge: users.maxAge,
        })
        .from(users)
        .where(and(eq(users.role, 'reader'), ne(users.id, adminId)))
        .orderBy(sql`${users.name} collate nocase`)
        .all();

const previewOf = (value: string | undefined): Preview | null => {
    if (value === 'all') return { maxAge: null };
    const age = Number(value);
    return value !== undefined && Number.isInteger(age) && age >= 0 && age <= 18
        ? { maxAge: age }
        : null;
};

/**
 * Vue lecteur pour un admin : `maxAge` (null : sans limite) ou `userId`
 * (compte simulé) pose le cookie, `DELETE` revient à la vue admin.
 * Utilisable aussi depuis la vue lecteur (le rôle réel reste admin).
 */
export const createPreviewRoutes = (db: Db, secure: boolean) => {
    const onlyAdmins = (c: Context<AuthEnv>) => {
        if (c.var.user.role !== 'admin' && !c.var.preview) {
            throw forbidden('Réservé aux administrateurs');
        }
    };
    // Vrai compte de l'admin (en simulation, `user` est le compte simulé).
    const adminId = (c: Context<AuthEnv>) =>
        userForSession(db, getCookie(c, SESSION_COOKIE) ?? '')!.id;

    return new Hono<AuthEnv>()
        .get('/accounts', (c) => {
            onlyAdmins(c);
            return c.json(simulableAccounts(db, adminId(c)));
        })
        .put(
            '/',
            zValidator(
                'json',
                z.union([
                    z.object({
                        maxAge: z.number().int().min(0).max(18).nullable(),
                    }),
                    z.object({ userId: z.number().int().positive() }),
                ]),
            ),
            (c) => {
                onlyAdmins(c);
                const body = c.req.valid('json');
                const options = {
                    httpOnly: true,
                    secure,
                    sameSite: 'Lax',
                    path: '/',
                } as const;
                if ('userId' in body) {
                    const user = simulatedUser(
                        db,
                        `${USER_PREFIX}${body.userId}`,
                        adminId(c),
                    );
                    if (!user)
                        throw badRequest('Ce compte ne peut pas être simulé');
                    setCookie(
                        c,
                        PREVIEW_COOKIE,
                        `${USER_PREFIX}${user.id}`,
                        options,
                    );
                    return c.json({
                        preview: {
                            maxAge: user.maxAge,
                            user: { id: user.id, name: user.name },
                        } as Preview,
                    });
                }
                setCookie(
                    c,
                    PREVIEW_COOKIE,
                    body.maxAge === null ? 'all' : String(body.maxAge),
                    options,
                );
                return c.json({ preview: { maxAge: body.maxAge } as Preview });
            },
        )
        .delete('/', (c) => {
            deleteCookie(c, PREVIEW_COOKIE, { path: '/' });
            return c.json({ preview: null });
        });
};

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
    if (c.var.user.role !== 'admin') {
        throw forbidden('Réservé aux administrateurs');
    }
    await next();
});
