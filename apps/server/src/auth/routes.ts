import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';

import type { Db } from '../db';
import { forbidden, unauthorized } from '../tools/errors';
import type { Logger } from '../tools/logger';
import { zValidator } from '../tools/validator';
import { type OidcClient, randomToken } from './oidc';
import {
    SESSION_DAYS,
    type SessionUser,
    createSession,
    deleteSession,
    roleFromGroups,
    upsertUser,
    userForSession,
} from './sessions';

export type AuthEnv = {
    Variables: {
        // Personne telle que vue par le catalogue (lecteur en vue lecteur).
        user: SessionUser;
        // Vue lecteur d'un admin : son âge maximal (null : sans limite).
        preview: { maxAge: number | null } | null;
    };
};

export type AuthDeps = {
    db: Db;
    logger: Logger;
    oidc: OidcClient;
    publicUrl: string;
    adminGroup: string;
    readerGroup: string;
};

const SESSION_COOKIE = 'bento_session';
// Vue lecteur d'un admin : âge maximal (« all » : sans limite).
const PREVIEW_COOKIE = 'bento_preview';
// Le temps d'aller-retour chez Pocket ID : state, code_verifier, page visée.
const FLOW_COOKIE = 'bento_oidc';
const FLOW_MINUTES = 10;

type Flow = { state: string; verifier: string; redirect: string };

/** Page interne où revenir après la connexion ; tout le reste mène à l'accueil. */
export const safeRedirect = (value: string | undefined) =>
    value &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\') &&
    !value.startsWith('/api/')
        ? value
        : '/';

const readFlow = (raw: string | undefined): Flow | undefined => {
    if (!raw) return undefined;
    try {
        const flow = JSON.parse(
            Buffer.from(raw, 'base64url').toString(),
        ) as Flow;
        return typeof flow.state === 'string' &&
            typeof flow.verifier === 'string'
            ? flow
            : undefined;
    } catch {
        return undefined;
    }
};

/** Connexion, retour de Pocket ID et déconnexion (montées sous `/auth`). */
export const createAuthRoutes = ({
    db,
    logger,
    oidc,
    publicUrl,
    adminGroup,
    readerGroup,
}: AuthDeps) => {
    // Cookies `Secure` dès que l'appli est servie en HTTPS.
    const secure = publicUrl.startsWith('https://');
    // Échec de connexion : page d'explication du client.
    const denied = (reason: string) => `/denied?reason=${reason}`;

    return new Hono()
        .get('/login', async (c) => {
            const flow: Flow = {
                state: randomToken(16),
                verifier: randomToken(32),
                redirect: safeRedirect(c.req.query('redirect')),
            };
            const url = await oidc.authorizationUrl(flow);
            setCookie(
                c,
                FLOW_COOKIE,
                Buffer.from(JSON.stringify(flow)).toString('base64url'),
                {
                    httpOnly: true,
                    secure,
                    sameSite: 'Lax',
                    path: '/api/auth',
                    maxAge: FLOW_MINUTES * 60,
                },
            );
            return c.redirect(url);
        })
        .get('/callback', async (c) => {
            const flow = readFlow(getCookie(c, FLOW_COOKIE));
            deleteCookie(c, FLOW_COOKIE, { path: '/api/auth' });
            const { code, state, error } = c.req.query();

            if (!flow || !state || state !== flow.state) {
                return c.redirect(denied('expired'));
            }
            if (error || !code) return c.redirect(denied('cancelled'));

            let user;
            try {
                user = await oidc.userFromCode(code, flow.verifier);
            } catch (err) {
                const cause = err instanceof Error ? err.cause : undefined;
                logger.warn(
                    `Connexion impossible : ${String(err)}` +
                        (cause ? ` (${String(cause)})` : ''),
                );
                return c.redirect(denied('failed'));
            }
            const role = roleFromGroups(user.groups, {
                adminGroup,
                readerGroup,
            });
            if (!role) {
                logger.info(
                    `Connexion refusée pour ${user.name} : ni ${adminGroup} ni ${readerGroup}`,
                );
                return c.redirect(denied('group'));
            }

            const { id } = upsertUser(db, user, role);
            setCookie(c, SESSION_COOKIE, createSession(db, id), {
                httpOnly: true,
                secure,
                sameSite: 'Lax',
                path: '/',
                maxAge: SESSION_DAYS * 24 * 60 * 60,
            });
            logger.info(`Connexion de ${user.name} (${role})`);
            return c.redirect(flow.redirect);
        })
        .post('/logout', async (c) => {
            const token = getCookie(c, SESSION_COOKIE);
            if (token) deleteSession(db, token);
            deleteCookie(c, SESSION_COOKIE, { path: '/' });
            // Fermer aussi la session Pocket ID, si possible.
            const logoutUrl = await oidc
                .logoutUrl(publicUrl)
                .catch(() => undefined);
            return c.json({ logoutUrl: logoutUrl ?? null });
        });
};

/** Exige une session valide ; la personne connectée est dans `c.var.user`. */
export const requireUser = (db: Db) =>
    createMiddleware<AuthEnv>(async (c, next) => {
        const token = getCookie(c, SESSION_COOKIE);
        const user = token ? userForSession(db, token) : undefined;
        if (!user) throw unauthorized('Connexion requise');
        const preview =
            user.role === 'admin'
                ? previewOf(getCookie(c, PREVIEW_COOKIE))
                : null;
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

const previewOf = (value: string | undefined) => {
    if (value === 'all') return { maxAge: null };
    const age = Number(value);
    return value !== undefined && Number.isInteger(age) && age >= 0 && age <= 18
        ? { maxAge: age }
        : null;
};

/**
 * Vue lecteur pour un admin : `maxAge` (null : sans limite) pose le
 * cookie, `undefined` revient à la vue admin. Utilisable aussi depuis la
 * vue lecteur (le rôle réel reste admin).
 */
export const createPreviewRoutes = (secure: boolean) =>
    new Hono<AuthEnv>()
        .put(
            '/',
            zValidator(
                'json',
                z.object({
                    maxAge: z.number().int().min(0).max(18).nullable(),
                }),
            ),
            (c) => {
                if (c.var.user.role !== 'admin' && !c.var.preview) {
                    throw forbidden('Réservé aux administrateurs');
                }
                const { maxAge } = c.req.valid('json');
                setCookie(
                    c,
                    PREVIEW_COOKIE,
                    maxAge === null ? 'all' : String(maxAge),
                    { httpOnly: true, secure, sameSite: 'Lax', path: '/' },
                );
                return c.json({ preview: { maxAge } });
            },
        )
        .delete('/', (c) => {
            deleteCookie(c, PREVIEW_COOKIE, { path: '/' });
            return c.json({ preview: null });
        });

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
    if (c.var.user.role !== 'admin') {
        throw forbidden('Réservé aux administrateurs');
    }
    await next();
});
