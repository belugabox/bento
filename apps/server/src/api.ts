import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import type { PageReader } from './archive/archive';
import { NUMBER_FIELDS } from './archive/comicInfo';
import { COMIC_INFO_FIELDS } from './archive/write';
import {
    type AuthDeps,
    type AuthEnv,
    createAuthRoutes,
    createPreviewRoutes,
    requireAdmin,
    requireUser,
} from './auth/routes';
import { listUsers, setUserMaxAge } from './auth/users';
import type { Db } from './db';
import {
    getSeries,
    getVolume,
    listLibraries,
    listSeries,
    savePageSizes,
    seriesCoverOf,
    setSeriesReadingMode,
    setSeriesStatus,
} from './library/catalog';
import {
    MAX_IMAGE_BYTES,
    type SeriesCovers,
    draftCoverFile,
    seriesCoverFile,
} from './library/covers';
import type { LibraryFiles } from './library/files';
import {
    getProgress,
    listInProgress,
    markSeries,
    saveProgress,
} from './library/progress';
import { type LibraryScanner, coverFile } from './library/scanner';
import { getStats } from './library/stats';
import type { Wikipedia } from './metadata/wikipedia';
import { AppError, notFound } from './tools/errors';
import type { Logger } from './tools/logger';
import { zValidator } from './tools/validator';

export type ApiDeps = {
    db: Db;
    logger: Logger;
    version: string;
    scanner: LibraryScanner;
    pages: PageReader;
    coversPath: string;
    files: LibraryFiles;
    covers: SeriesCovers;
    wikipedia: Wikipedia;
    auth: Omit<AuthDeps, 'db' | 'logger'>;
};

const idParam = z.object({ id: z.coerce.number().int().positive() });

// Fichier d'une bibliothèque, relatif à sa racine.
const fileQuery = z.object({ path: z.string().min(1) });

const READING_MODES = ['ltr', 'ltr-manga', 'rtl', 'webtoon'] as const;

// Couverture choisie, et partie gardée de l'image recadrée en 2:3.
const position = z.enum(['top', 'center', 'bottom']).optional();
const page = z.number().int().min(0).optional();
const coverSource = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('volume'),
        volumeId: z.number().int().positive(),
        page,
        position,
    }),
    z.object({
        type: z.literal('file'),
        path: z.string().min(1),
        page,
        position,
    }),
    z.object({ type: z.literal('url'), url: z.string(), position }),
    z.object({
        type: z.literal('image'),
        // Base64 : un tiers plus long que l'image.
        data: z.string().max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4),
        position,
    }),
    z.object({ type: z.literal('default') }),
]);

const positionOf = (source: z.infer<typeof coverSource>) =>
    'position' in source ? source.position : undefined;

const NUMERIC = new Set<string>(NUMBER_FIELDS);

// Modifications d'un ComicInfo : champs connus, null ou vide pour retirer.
const comicInfoChanges = z
    .record(z.string(), z.union([z.string(), z.number(), z.null()]))
    .superRefine((changes, ctx) => {
        for (const [field, value] of Object.entries(changes)) {
            if (!(COMIC_INFO_FIELDS as string[]).includes(field)) {
                ctx.addIssue({
                    code: 'custom',
                    message: `champ inconnu ${field}`,
                });
            } else if (
                value !== null &&
                value !== '' &&
                NUMERIC.has(field) !== (typeof value === 'number')
            ) {
                ctx.addIssue({
                    code: 'custom',
                    message: `${field} : type invalide`,
                });
            }
        }
    });

/** Routes de l'API, montées sous `/api`. */
export const createApi = ({
    db,
    logger,
    version,
    scanner,
    pages,
    coversPath,
    files,
    covers,
    wikipedia,
    auth,
}: ApiDeps) =>
    new Hono<AuthEnv>()
        .onError((err, c) => {
            const route = `${c.req.method} ${c.req.path}`;
            // Erreur métier attendue : message destiné à l'utilisateur.
            if (err instanceof AppError) {
                logger.warn(`${route} → ${err.status}: ${err.message}`);
                return c.json(
                    { name: err.name, message: err.message },
                    err.status,
                );
            }
            // Erreur interne : aucun détail renvoyé au client, tout dans les logs.
            logger.error(err, `${route} failed`);
            return c.json(
                { name: 'Error', message: 'Erreur interne du serveur' },
                500,
            );
        })
        // Public : utilisé par le HEALTHCHECK Docker.
        .get('/health', (c) => {
            db.run(sql`select 1`);
            return c.json({ status: 'ok' as const, version });
        })
        .route('/auth', createAuthRoutes({ db, logger, ...auth }))
        // Tout ce qui suit exige une session.
        .use('*', requireUser(db))
        .get('/me', (c) => c.json({ ...c.var.user, preview: c.var.preview }))
        // Vue lecteur d'un admin (âge choisi), et retour à la vue admin.
        .route(
            '/preview',
            createPreviewRoutes(auth.publicUrl.startsWith('https://')),
        )
        .get('/libraries', (c) =>
            c.json(
                listLibraries(db).map((library) => ({
                    ...library,
                    scanning: scanner.isScanning(library.id),
                })),
            ),
        )
        .post(
            '/libraries/:id/scan',
            requireAdmin,
            zValidator('param', idParam),
            async (c) => {
                const { id } = c.req.valid('param');
                if (!listLibraries(db).some((library) => library.id === id)) {
                    throw notFound('Bibliothèque introuvable');
                }
                return c.json(await scanner.scan(id));
            },
        )
        .get(
            '/series',
            zValidator(
                'query',
                z.object({
                    libraryId: z.coerce.number().int().positive().optional(),
                    search: z.string().optional(),
                }),
            ),
            (c) => c.json(listSeries(db, c.var.user, c.req.valid('query'))),
        )
        .get('/series/:id', zValidator('param', idParam), (c) =>
            c.json(getSeries(db, c.var.user, c.req.valid('param').id)),
        )
        .put(
            '/series/:id/status',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    status: z.enum(['ongoing', 'completed']).nullable(),
                }),
            ),
            (c) =>
                c.json(
                    setSeriesStatus(
                        db,
                        c.req.valid('param').id,
                        c.req.valid('json').status,
                    ),
                ),
        )
        .put(
            '/series/:id/reading-mode',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    readingMode: z.enum(READING_MODES).nullable(),
                }),
            ),
            (c) =>
                c.json(
                    setSeriesReadingMode(
                        db,
                        c.req.valid('param').id,
                        c.req.valid('json').readingMode,
                    ),
                ),
        )
        // Toute la série lue ou non lue, pour la personne.
        .put(
            '/series/:id/read',
            zValidator('param', idParam),
            zValidator('json', z.object({ read: z.boolean() })),
            (c) =>
                c.json(
                    markSeries(
                        db,
                        c.var.user,
                        c.req.valid('param').id,
                        c.req.valid('json').read,
                    ),
                ),
        )
        // Couverture de la série : celle choisie, sinon celle du premier tome.
        .get('/series/:id/cover', zValidator('param', idParam), async (c) => {
            const { id } = c.req.valid('param');
            const { coverUpdatedAt, firstVolumeId } = seriesCoverOf(
                db,
                c.var.user,
                id,
            );
            const file = coverUpdatedAt
                ? seriesCoverFile(coversPath, id)
                : firstVolumeId && coverFile(coversPath, firstVolumeId);
            const cover = file
                ? await readFile(file).catch(() => undefined)
                : undefined;
            if (!cover) throw notFound('Couverture introuvable');
            return c.body(new Uint8Array(cover), 200, {
                'Content-Type': 'image/webp',
                // L'adresse du client change avec la couverture (?v=).
                'Cache-Control': 'private, max-age=3600',
            });
        })
        .put(
            '/series/:id/cover',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('json', coverSource),
            async (c) => {
                const source = c.req.valid('json');
                return c.json(
                    await covers.set(
                        c.req.valid('param').id,
                        source,
                        positionOf(source),
                    ),
                );
            },
        )
        // --- Métadonnées Wikipédia (admin).
        .get(
            '/metadata/wikipedia/search',
            requireAdmin,
            zValidator(
                'query',
                z.object({
                    q: z.string().trim().min(1),
                    kind: z.enum(['manga', 'comics']).default('manga'),
                }),
            ),
            async (c) => {
                const { q, kind } = c.req.valid('query');
                return c.json(await wikipedia.search(q, kind));
            },
        )
        .get(
            '/metadata/wikipedia/:id',
            requireAdmin,
            zValidator('param', idParam),
            async (c) =>
                c.json(await wikipedia.series(c.req.valid('param').id)),
        )
        .get('/volumes/:id', zValidator('param', idParam), (c) => {
            // Le chemin sur disque reste côté serveur.
            const {
                fullPath: _fullPath,
                pageSizes: _pageSizes,
                ...volume
            } = getVolume(db, c.var.user, c.req.valid('param').id);
            return c.json({
                ...volume,
                progress: getProgress(db, c.var.user.id, volume.id),
            });
        })
        .put(
            '/volumes/:id/progress',
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    page: z.number().int().min(0).optional(),
                    completed: z.boolean().optional(),
                }),
            ),
            (c) => {
                // Tome d'une série masquée : introuvable.
                const { id } = getVolume(
                    db,
                    c.var.user,
                    c.req.valid('param').id,
                );
                return c.json({
                    progress: saveProgress(
                        db,
                        c.var.user.id,
                        id,
                        c.req.valid('json'),
                    ),
                });
            },
        )
        // Dimensions des pages (double page), calculées à la première demande.
        .get(
            '/volumes/:id/page-sizes',
            zValidator('param', idParam),
            async (c) => {
                const volume = getVolume(
                    db,
                    c.var.user,
                    c.req.valid('param').id,
                );
                if (volume.pageSizes) return c.json(volume.pageSizes);
                const sizes = await pages.sizes(volume.fullPath);
                savePageSizes(db, volume.id, sizes);
                return c.json(sizes);
            },
        )
        // Tomes commencés, pour « Reprendre la lecture ».
        .get('/continue', (c) => c.json(listInProgress(db, c.var.user)))
        .get('/volumes/:id/cover', zValidator('param', idParam), async (c) => {
            const { id } = getVolume(db, c.var.user, c.req.valid('param').id);
            const cover = await readFile(coverFile(coversPath, id)).catch(
                () => {
                    throw notFound('Couverture introuvable');
                },
            );
            return c.body(new Uint8Array(cover), 200, {
                'Content-Type': 'image/webp',
                'Cache-Control': 'private, max-age=3600',
            });
        })
        .get(
            '/volumes/:id/pages/:index',
            zValidator(
                'param',
                idParam.extend({ index: z.coerce.number().int().min(0) }),
            ),
            async (c) => {
                const { id, index } = c.req.valid('param');
                const { data, type } = await pages.page(
                    getVolume(db, c.var.user, id).fullPath,
                    index,
                );
                return c.body(new Uint8Array(data), 200, {
                    'Content-Type': type,
                    'Cache-Control': 'private, max-age=3600',
                });
            },
        )
        // --- Gestion des fichiers (admin) : brouillons, ComicInfo, rangement.
        // Statistiques de la bibliothèque et de la lecture (admin).
        .get('/stats', requireAdmin, async (c) =>
            c.json({
                ...getStats(db),
                pendingDrafts: await files.pendingSeries(),
            }),
        )
        // Nombre de séries en attente (pastille de l'en-tête).
        .get('/drafts/pending', requireAdmin, async (c) =>
            c.json({ series: await files.pendingSeries() }),
        )
        .get(
            '/libraries/:id/drafts',
            requireAdmin,
            zValidator('param', idParam),
            async (c) => c.json(await files.drafts(c.req.valid('param').id)),
        )
        // Réglages de la future série d'un dossier de brouillons.
        .put(
            '/libraries/:id/drafts/status',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    folder: z.string().min(1),
                    status: z.enum(['ongoing', 'completed']).nullable(),
                }),
            ),
            (c) => {
                const { folder, status } = c.req.valid('json');
                const saved = files.setDraftSettings(
                    c.req.valid('param').id,
                    folder,
                    { status },
                );
                return c.json({ status: saved.status });
            },
        )
        .put(
            '/libraries/:id/drafts/reading-mode',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    folder: z.string().min(1),
                    readingMode: z.enum(READING_MODES).nullable(),
                }),
            ),
            (c) => {
                const { folder, readingMode } = c.req.valid('json');
                const saved = files.setDraftSettings(
                    c.req.valid('param').id,
                    folder,
                    { readingMode },
                );
                return c.json({ readingMode: saved.readingMode });
            },
        )
        .get(
            '/libraries/:id/drafts/cover',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('query', z.object({ folder: z.string().min(1) })),
            async (c) => {
                const cover = await readFile(
                    draftCoverFile(
                        coversPath,
                        c.req.valid('param').id,
                        c.req.valid('query').folder,
                    ),
                ).catch(() => {
                    throw notFound('Couverture introuvable');
                });
                return c.body(new Uint8Array(cover), 200, {
                    'Content-Type': 'image/webp',
                    // L'adresse du client change avec la couverture (?v=).
                    'Cache-Control': 'private, max-age=3600',
                });
            },
        )
        .put(
            '/libraries/:id/drafts/cover',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('query', z.object({ folder: z.string().min(1) })),
            zValidator('json', coverSource),
            async (c) => {
                const source = c.req.valid('json');
                const saved = await covers.setDraft(
                    c.req.valid('param').id,
                    c.req.valid('query').folder,
                    source,
                    positionOf(source),
                );
                return c.json({ coverUpdatedAt: saved.coverUpdatedAt });
            },
        )
        .get(
            '/libraries/:id/drafts/files',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('query', z.object({ folder: z.string().min(1) })),
            async (c) =>
                c.json(
                    await files.draftFolder(
                        c.req.valid('param').id,
                        c.req.valid('query').folder,
                    ),
                ),
        )
        .get(
            '/libraries/:id/files/info',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('query', fileQuery),
            async (c) =>
                c.json(
                    await files.info(
                        c.req.valid('param').id,
                        c.req.valid('query').path,
                    ),
                ),
        )
        .get(
            '/libraries/:id/files/cover',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('query', fileQuery),
            async (c) => {
                const { id } = c.req.valid('param');
                const { path } = c.req.valid('query');
                // Lire le fichier génère sa couverture au besoin.
                await files.info(id, path);
                const cover = await readFile(
                    files.coverPath(files.fullPath(id, path)),
                ).catch(() => {
                    throw notFound('Couverture introuvable');
                });
                return c.body(new Uint8Array(cover), 200, {
                    'Content-Type': 'image/webp',
                    'Cache-Control': 'private, no-cache',
                });
            },
        )
        .get(
            '/libraries/:id/files/pages/:index',
            requireAdmin,
            zValidator(
                'param',
                idParam.extend({ index: z.coerce.number().int().min(0) }),
            ),
            zValidator('query', fileQuery),
            async (c) => {
                const { id, index } = c.req.valid('param');
                const { data, type } = await files.page(
                    id,
                    c.req.valid('query').path,
                    index,
                );
                return c.body(new Uint8Array(data), 200, {
                    'Content-Type': type,
                    'Cache-Control': 'private, no-cache',
                });
            },
        )
        .get(
            '/libraries/:id/files/page-sizes',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('query', fileQuery),
            async (c) =>
                c.json(
                    await files.pageSizes(
                        c.req.valid('param').id,
                        c.req.valid('query').path,
                    ),
                ),
        )
        .put(
            '/libraries/:id/files/comic-info',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    updates: z
                        .array(
                            z.object({
                                path: z.string().min(1),
                                changes: comicInfoChanges,
                            }),
                        )
                        .min(1),
                }),
            ),
            async (c) =>
                c.json(
                    await files.updateComicInfo(
                        c.req.valid('param').id,
                        c.req.valid('json').updates,
                    ),
                ),
        )
        .post(
            '/libraries/:id/files/publish',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({ paths: z.array(z.string().min(1)).min(1) }),
            ),
            async (c) =>
                c.json(
                    await files.publish(
                        c.req.valid('param').id,
                        c.req.valid('json').paths,
                    ),
                ),
        )
        // Comptes et contrôle parental (admin).
        .get('/users', requireAdmin, (c) => c.json(listUsers(db)))
        .patch(
            '/users/:id',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    maxAge: z.number().int().min(0).max(18).nullable(),
                }),
            ),
            (c) =>
                c.json(
                    setUserMaxAge(
                        db,
                        c.req.valid('param').id,
                        c.req.valid('json').maxAge,
                    ),
                ),
        );

export type ApiType = ReturnType<typeof createApi>;
