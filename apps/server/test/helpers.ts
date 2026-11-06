import AdmZip from 'adm-zip';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pino } from 'pino';
import sharp from 'sharp';

import { PageReader } from '../src/archive/archive';
import { OidcClient, codeChallenge } from '../src/auth/oidc';
import { type Role, createSession, upsertUser } from '../src/auth/sessions';
import type { Db } from '../src/db';
import { openDatabase } from '../src/db';
import { syncLibraries } from '../src/library/catalog';
import { SeriesCovers } from '../src/library/covers';
import { LibraryFiles } from '../src/library/files';
import { LibraryScanner } from '../src/library/scanner';
import { Wikipedia } from '../src/metadata/wikipedia';

export const silent = pino({ level: 'silent' });

/** Petite image PNG unie (vraie image : sharp doit pouvoir la lire). */
export const png = (color: string) =>
    sharp({
        create: { width: 20, height: 30, channels: 3, background: color },
    })
        .png()
        .toBuffer();

/** Écrit un CBZ : pages nommées, ComicInfo optionnel. */
export const writeCbz = async (
    fullPath: string,
    { pages = 2, comicInfo }: { pages?: number; comicInfo?: string } = {},
) => {
    const zip = new AdmZip();
    for (let i = 1; i <= pages; i++) {
        zip.addFile(`p${i}.png`, await png(i % 2 ? '#ff0000' : '#0000ff'));
    }
    if (comicInfo) {
        zip.addFile(
            'ComicInfo.xml',
            Buffer.from(
                `<?xml version="1.0"?><ComicInfo>${comicInfo}</ComicInfo>`,
            ),
        );
    }
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, zip.toBuffer());
};

/** Bibliothèque temporaire, base en mémoire et scanner prêts à l'emploi. */
export const setup = async (type: 'manga' | 'comics' = 'manga') => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bento-'));
    const root = path.join(dir, 'library');
    const coversPath = path.join(dir, 'covers');
    await mkdir(root, { recursive: true });
    const database = openDatabase(':memory:');
    const [library] = await syncLibraries(
        database.db,
        [{ name: 'Mangas', path: root, type }],
        coversPath,
    );
    const scanner = new LibraryScanner(database.db, coversPath, silent);
    const pages = new PageReader();
    return {
        db: database.db,
        root,
        coversPath,
        library: library!,
        scanner,
        pages,
        files: new LibraryFiles(
            database.db,
            scanner,
            pages,
            coversPath,
            silent,
        ),
        covers: new SeriesCovers(database.db, pages, coversPath),
        // Pas de réseau dans les tests : toute requête échoue.
        wikipedia: new Wikipedia(() => Promise.reject(new Error('hors ligne'))),
        file: (relative: string) => path.join(root, ...relative.split('/')),
        cleanup: async () => {
            database.close();
            await rm(dir, { recursive: true, force: true });
        },
    };
};

/** Cookie d'une session ouverte pour une personne de ce rôle. */
/**
 * Un format pour chaque dossier de brouillons : obligatoire pour publier
 * (sauf vers une série qui en a déjà un).
 */
export const formatDrafts = async (ctx: Awaited<ReturnType<typeof setup>>) => {
    for (const draft of await ctx.files.drafts(ctx.library.id)) {
        ctx.files.setDraftSettings(ctx.library.id, draft.folder, {
            formatId: 1,
        });
    }
};

export const sessionCookie = (db: Db, role: Role, sub = `${role}-sub`) => {
    const { id } = upsertUser(db, { sub, name: role, groups: [] }, role);
    return `bento_session=${createSession(db, id)}`;
};

export const ISSUER = 'https://auth.example.com';
export const PUBLIC_URL = 'http://localhost:5173';

type FakeUser = { sub: string; name: string; groups: string[] };

/**
 * Faux Pocket ID : découverte, jeton (avec contrôle du secret et de PKCE) et
 * userinfo. `users` associe un code d'autorisation à la personne renvoyée.
 */
export const fakeOidc = (users: Record<string, FakeUser>) => {
    // Défi PKCE reçu à l'autorisation, à comparer au code_verifier.
    let challenge: string | undefined;
    const tokens = new Map<string, string>();
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    const fetchFn = (async (
        input: string | URL | Request,
        init?: RequestInit,
    ) => {
        const url = new URL(String(input));
        const headers = new Headers(init?.headers);
        switch (url.pathname) {
            case '/.well-known/openid-configuration':
                return json({
                    issuer: ISSUER,
                    authorization_endpoint: `${ISSUER}/authorize`,
                    token_endpoint: `${ISSUER}/token`,
                    userinfo_endpoint: `${ISSUER}/userinfo`,
                    end_session_endpoint: `${ISSUER}/end-session`,
                });
            case '/token': {
                const body = new URLSearchParams(String(init?.body));
                const code = body.get('code') ?? '';
                const expected = `Basic ${Buffer.from('bento:secret').toString('base64')}`;
                if (
                    headers.get('Authorization') !== expected ||
                    !users[code] ||
                    codeChallenge(body.get('code_verifier') ?? '') !== challenge
                ) {
                    return json({ error: 'invalid_grant' }, 400);
                }
                tokens.set(`token-${code}`, code);
                return json({ access_token: `token-${code}` });
            }
            case '/userinfo': {
                const token = headers
                    .get('Authorization')
                    ?.replace('Bearer ', '');
                const code = token ? tokens.get(token) : undefined;
                return code ? json(users[code]) : json({}, 401);
            }
            default:
                return json({}, 404);
        }
    }) as typeof fetch;
    return {
        client: new OidcClient(
            {
                issuer: ISSUER,
                clientId: 'bento',
                clientSecret: 'secret',
                redirectUri: `${PUBLIC_URL}/api/auth/callback`,
            },
            fetchFn,
        ),
        /** Mémorise le défi PKCE de l'adresse d'autorisation. */
        authorize: (location: string) => {
            const url = new URL(location);
            challenge = url.searchParams.get('code_challenge') ?? undefined;
            return url;
        },
    };
};

export const authDeps = (oidc = fakeOidc({}).client) => ({
    oidc,
    publicUrl: PUBLIC_URL,
    adminGroup: 'bento-admins',
    readerGroup: 'bento-readers',
});
