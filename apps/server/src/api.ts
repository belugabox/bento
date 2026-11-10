import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import type { PageReader } from './archive/archive';
import { NUMBER_FIELDS } from './archive/comicInfo';
import { COMIC_INFO_FIELDS } from './archive/write';
import { avatarChoice, avatarSvg } from './auth/avatar';
import {
    createInvitation,
    createUserLink,
    deleteInvitation,
    listInvitations,
} from './auth/links';
import {
    type AuthDeps,
    type AuthEnv,
    createAuthRoutes,
    createPreviewRoutes,
    requireAdmin,
    requireUser,
} from './auth/routes';
import { isAvatarSeed } from './auth/rules';
import { deleteUser, listUsers, updateAccount, updateUser } from './auth/users';
import { READING_MODES } from './classification';
import type { Db } from './db';
import {
    getSeries,
    getVolume,
    listCredits,
    listLibraries,
    listSeries,
    savePageSizes,
    seriesCoverOf,
    setSeriesClassification,
    setSeriesReadingMode,
    setSeriesStatus,
} from './library/catalog';
import { CompressionQueue } from './library/compression';
import {
    MAX_IMAGE_BYTES,
    type SeriesCovers,
    draftCoverFile,
    seriesCoverFile,
} from './library/covers';
import type { LibraryFiles } from './library/files';
import {
    checkFormatId,
    createFormat,
    deleteFormat,
    listFormats,
    updateFormat,
} from './library/formats';
import {
    createGenre,
    deleteGenre,
    listGenres,
    updateGenre,
} from './library/genres';
import { setSeriesLists } from './library/lists';
import { countToClassify, listManagedSeries } from './library/management';
import { isPageWidth } from './library/pageWidths';
import {
    getProgress,
    listContinue,
    listRecentVolumes,
    markSeries,
    restoreProgress,
    saveProgress,
    snapshotProgress,
} from './library/progress';
import { familyReaders, seriesReaders } from './library/readers';
import { addReadingTime } from './library/readingTime';
import { ResizedPages } from './library/resizedPages';
import { type LibraryScanner, coverFile } from './library/scanner';
import { readCover } from './library/smallCovers';
import { getStats } from './library/stats';
import { Bedetheque } from './metadata/bedetheque';
import { MangaNews } from './metadata/mangaNews';
import {
    METADATA_SOURCES,
    isSourceId,
    parseSources,
    sourcesText,
} from './metadata/sourceLink';
import type { Wikipedia } from './metadata/wikipedia';
import { KavitaImport } from './migration/kavita';
import { SettingsStore, settingsUpdateSchema } from './settings';
import { AppError, badRequest, notFound } from './tools/errors';
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
    /** Manga-news (le vrai site si absent). */
    mangaNews?: MangaNews;
    /** Bedetheque (le vrai site si absent). */
    bedetheque?: Bedetheque;
    /** Réglages de l'admin (valeurs par défaut si absents). */
    settings?: SettingsStore;
    kavita?: KavitaImport;
    /** File des compressions (créée avec `files` si absente). */
    compression?: CompressionQueue;
    /** Pages réduites à la largeur d'un écran (à côté des couvertures). */
    resizedPages?: ResizedPages;
    auth: Omit<AuthDeps, 'db' | 'logger'>;
};

const idParam = z.object({ id: z.coerce.number().int().positive() });

// Fichier d'une bibliothèque, relatif à sa racine.
const fileQuery = z.object({ path: z.string().min(1) });
// `?size=small` : version réduite d'une couverture (vignettes des grilles).
const smallCover = (size?: string) => (size === 'small' ? size : undefined);

/**
 * Cache d'une image de la bibliothèque. Avec sa version dans l'adresse
 * (`?v=`), elle ne change jamais : le navigateur la garde un an.
 */
const imageCache = (version?: string) =>
    version ? 'private, max-age=31536000, immutable' : 'private, max-age=3600';

// Format, âge et fiches en ligne d'une série, réglés dans Bento : null
// (liste vide pour les fiches) pour les retirer.
const sourceLink = z
    .object({ site: z.enum(METADATA_SOURCES), id: z.string() })
    .refine(isSourceId, 'Fiche en ligne invalide');
const classificationBody = z.object({
    formatId: z.number().int().positive().nullable().optional(),
    age: z.number().int().min(0).max(99).nullable().optional(),
    sources: z
        .array(sourceLink)
        .max(METADATA_SOURCES.length)
        .refine(
            (links) => new Set(links.map((l) => l.site)).size === links.length,
            'Une seule fiche par site',
        )
        .optional(),
});

const formatBody = z.object({
    name: z.string().trim().min(1).max(40),
    readingMode: z.enum(READING_MODES),
});

const genreBody = z.object({
    name: z.string().trim().min(1).max(60),
    aliases: z.array(z.string().trim().max(60)).max(50).default([]),
});

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
    mangaNews = new MangaNews(),
    bedetheque = new Bedetheque(),
    settings = new SettingsStore(db),
    // Base de Kavita envoyée pour la migration, à côté des couvertures.
    kavita = new KavitaImport(
        db,
        path.join(path.dirname(coversPath), 'kavita'),
    ),
    compression = new CompressionQueue(
        files,
        logger,
        () => settings.get().compression,
        scanner.tasks,
    ),
    resizedPages = new ResizedPages(
        path.join(path.dirname(coversPath), 'pages'),
    ),
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
        // Public : la page de connexion prend aussi le thème par défaut.
        .get('/appearance', (c) => c.json(settings.get().appearance))
        .route('/auth', createAuthRoutes({ db, logger, ...auth }))
        // Public : avatar DiceBear « Clay » d'une graine (page d'inscription).
        .get('/avatars/:seed', (c) => {
            const seed = c.req.param('seed');
            if (!isAvatarSeed(seed)) throw badRequest('Avatar invalide');
            c.header('Content-Type', 'image/svg+xml');
            c.header('Cache-Control', 'public, max-age=31536000, immutable');
            return c.body(avatarSvg(seed));
        })
        // Public : parties d'un avatar, pour le modifier.
        .get('/avatars/:seed/choice', (c) => {
            const seed = c.req.param('seed');
            if (!isAvatarSeed(seed)) throw badRequest('Avatar invalide');
            c.header('Cache-Control', 'public, max-age=31536000, immutable');
            return c.json(avatarChoice(seed));
        })
        // Tout ce qui suit exige une session.
        .use('*', requireUser(db))
        .get('/me', (c) => c.json({ ...c.var.user, preview: c.var.preview }))
        // « Mon compte » : identifiant, e-mail, avatar, mot de passe.
        .patch(
            '/me',
            zValidator(
                'json',
                z.object({
                    username: z.string().max(100).optional(),
                    email: z
                        .string()
                        .trim()
                        .email('E-mail invalide')
                        .max(200)
                        .or(z.literal(''))
                        .nullable()
                        .optional(),
                    avatarSeed: z
                        .string()
                        .refine(isAvatarSeed, 'Avatar invalide')
                        .optional(),
                    password: z.string().max(200).optional(),
                    currentPassword: z.string().max(200).optional(),
                }),
            ),
            async (c) => {
                await updateAccount(db, c.var.user.id, c.req.valid('json'));
                return c.json({ ok: true as const });
            },
        )
        // Vue lecteur d'un admin (âge choisi), et retour à la vue admin.
        .route(
            '/preview',
            createPreviewRoutes(db, auth.publicUrl.startsWith('https://')),
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
        // Filtre « Lu par » de l'accueil : les autres comptes et leurs séries lues.
        .get('/readers', (c) =>
            c.json(familyReaders(db, c.var.user, settings.get().readByPercent)),
        )
        // Les autres comptes qui ont lu la série (seuil dans les réglages).
        .get('/series/:id/readers', zValidator('param', idParam), (c) =>
            c.json(
                seriesReaders(
                    db,
                    c.var.user,
                    c.req.valid('param').id,
                    settings.get().readByPercent,
                ),
            ),
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
        .put(
            '/series/:id/classification',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('json', classificationBody),
            (c) => {
                checkFormatId(db, c.req.valid('json').formatId);
                return c.json(
                    setSeriesClassification(
                        db,
                        c.req.valid('param').id,
                        c.req.valid('json'),
                    ),
                );
            },
        )
        // Formats : lus par tous (filtres), gérés par l'admin.
        .get('/formats', (c) => c.json(listFormats(db)))
        .post('/formats', requireAdmin, zValidator('json', formatBody), (c) =>
            c.json(createFormat(db, c.req.valid('json'))),
        )
        .patch(
            '/formats/:id',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('json', formatBody.partial()),
            (c) =>
                c.json(
                    updateFormat(
                        db,
                        c.req.valid('param').id,
                        c.req.valid('json'),
                    ),
                ),
        )
        .delete(
            '/formats/:id',
            requireAdmin,
            zValidator('param', idParam),
            (c) => c.json(deleteFormat(db, c.req.valid('param').id)),
        )
        // Liste des genres : lue par tous (filtres), gérée par l'admin.
        .get('/genres', (c) => c.json(listGenres(db)))
        .post('/genres', requireAdmin, zValidator('json', genreBody), (c) =>
            c.json(createGenre(db, c.req.valid('json'))),
        )
        .patch(
            '/genres/:id',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('json', genreBody.partial()),
            (c) =>
                c.json(
                    updateGenre(
                        db,
                        c.req.valid('param').id,
                        c.req.valid('json'),
                    ),
                ),
        )
        .delete(
            '/genres/:id',
            requireAdmin,
            zValidator('param', idParam),
            // Genre dans lequel le fusionner.
            zValidator(
                'query',
                z.object({
                    into: z.coerce.number().int().positive().optional(),
                }),
            ),
            (c) =>
                c.json(
                    deleteGenre(
                        db,
                        c.req.valid('param').id,
                        c.req.valid('query').into,
                    ),
                ),
        )
        // Liste « à lire » de la personne.
        .put(
            '/series/:id/lists',
            zValidator('param', idParam),
            zValidator('json', z.object({ toRead: z.boolean().optional() })),
            (c) =>
                c.json(
                    setSeriesLists(
                        db,
                        c.var.user,
                        c.req.valid('param').id,
                        c.req.valid('json'),
                    ),
                ),
        )
        // Toute la série lue ou non lue, pour la personne.
        .put(
            '/series/:id/read',
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    read: z.boolean(),
                    // Seulement ce tome et ceux d'avant.
                    upTo: z.number().int().positive().optional(),
                }),
            ),
            (c) =>
                c.json(
                    markSeries(
                        db,
                        c.var.user,
                        c.req.valid('param').id,
                        c.req.valid('json').read,
                        c.req.valid('json').upTo,
                    ),
                ),
        )
        // Annulation : progression remise telle qu'elle était.
        .put(
            '/progress/restore',
            zValidator(
                'json',
                z.object({
                    items: z
                        .array(
                            z.object({
                                volumeId: z.number().int().positive(),
                                progress: z
                                    .object({
                                        page: z.number().int().min(0),
                                        completed: z.boolean(),
                                        updatedAt: z.number().int().min(0),
                                    })
                                    .nullable(),
                            }),
                        )
                        .max(2000),
                }),
            ),
            (c) =>
                c.json(
                    restoreProgress(db, c.var.user, c.req.valid('json').items),
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
                ? await readCover(file, smallCover(c.req.query('size')))
                : undefined;
            if (!cover) throw notFound('Couverture introuvable');
            return c.body(new Uint8Array(cover), 200, {
                'Content-Type': 'image/webp',
                // L'adresse du client change avec la couverture (?v=).
                'Cache-Control': imageCache(c.req.query('v')),
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
            zValidator('query', z.object({ q: z.string().trim().min(1) })),
            async (c) => c.json(await wikipedia.search(c.req.valid('query').q)),
        )
        .get(
            '/metadata/wikipedia/:id',
            requireAdmin,
            zValidator('param', idParam),
            async (c) =>
                c.json(await wikipedia.series(c.req.valid('param').id)),
        )
        // --- Métadonnées Manga-news (admin), lues à la demande.
        .get(
            '/metadata/manga-news/search',
            requireAdmin,
            zValidator('query', z.object({ q: z.string().trim().min(1) })),
            async (c) => c.json(await mangaNews.search(c.req.valid('query').q)),
        )
        .get(
            '/metadata/manga-news/series',
            requireAdmin,
            // Fin de l'adresse de la fiche (« Spy-X-Family »).
            zValidator('query', z.object({ id: z.string().min(1).max(200) })),
            async (c) =>
                c.json(await mangaNews.series(c.req.valid('query').id)),
        )
        // --- Bedetheque (admin) : BD, comics, romans graphiques.
        .get(
            '/metadata/bedetheque/search',
            requireAdmin,
            zValidator('query', z.object({ q: z.string().trim().min(1) })),
            async (c) =>
                c.json(await bedetheque.search(c.req.valid('query').q)),
        )
        .get(
            '/metadata/bedetheque/series',
            requireAdmin,
            // Identifiant de la série (IdBEL).
            zValidator(
                'query',
                z.object({ id: z.string().regex(/^\d{1,12}$/) }),
            ),
            async (c) =>
                c.json(await bedetheque.series(c.req.valid('query').id)),
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
                    // Lecture hors ligne : son heure réelle (ms).
                    at: z.number().int().positive().optional(),
                }),
            ),
            (c) => {
                // Tome d'une série masquée : introuvable.
                const { id } = getVolume(
                    db,
                    c.var.user,
                    c.req.valid('param').id,
                );
                // État d'avant, pour annuler (menus de l'accueil).
                const [previous] = snapshotProgress(db, c.var.user.id, [id]);
                return c.json({
                    progress: saveProgress(
                        db,
                        c.var.user.id,
                        id,
                        c.req.valid('json'),
                        c.req.valid('json').at
                            ? new Date(c.req.valid('json').at!)
                            : undefined,
                    ),
                    previous: previous!,
                });
            },
        )
        // Temps passé dans le lecteur, envoyé par morceaux (statistiques).
        .post(
            '/volumes/:id/reading-time',
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    seconds: z.number().int().min(1).max(600),
                    pages: z.number().int().min(0).max(2000),
                    // Lecture hors ligne : l'heure de fin réelle (ms).
                    at: z.number().int().positive().optional(),
                }),
            ),
            (c) => {
                const { id } = getVolume(
                    db,
                    c.var.user,
                    c.req.valid('param').id,
                );
                const { at, ...time } = c.req.valid('json');
                addReadingTime(
                    db,
                    c.var.user.id,
                    id,
                    time,
                    at && at < Date.now() ? new Date(at) : new Date(),
                );
                return c.json({ ok: true as const });
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
        // « Reprendre la lecture » : tomes en cours, ou suivants à ouvrir.
        .get('/continue', (c) => c.json(listContinue(db, c.var.user)))
        // Derniers ajouts (« Nouveautés », retirée de l'accueil pour l'instant).
        .get('/home', (c) =>
            c.json({ recent: listRecentVolumes(db, c.var.user) }),
        )
        .get('/volumes/:id/cover', zValidator('param', idParam), async (c) => {
            const { id } = getVolume(db, c.var.user, c.req.valid('param').id);
            const cover = await readCover(
                coverFile(coversPath, id),
                smallCover(c.req.query('size')),
            );
            if (!cover) throw notFound('Couverture introuvable');
            return c.body(new Uint8Array(cover), 200, {
                'Content-Type': 'image/webp',
                'Cache-Control': imageCache(c.req.query('v')),
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
                const volume = getVolume(db, c.var.user, id);
                const original = () => pages.page(volume.fullPath, index);
                // `?w=` : réduite à la largeur de l'écran (une des largeurs
                // prévues ; sinon la page d'origine).
                const width = Number(c.req.query('w'));
                const { data, type } = isPageWidth(width)
                    ? await resizedPages.get(
                          volume.id,
                          volume.version,
                          index,
                          width,
                          original,
                      )
                    : await original();
                return c.body(new Uint8Array(data), 200, {
                    'Content-Type': type,
                    'Cache-Control': imageCache(c.req.query('v')),
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
        // Noms déjà connus (suggestions de l'éditeur de métadonnées).
        .get(
            '/libraries/:id/credits',
            requireAdmin,
            zValidator('param', idParam),
            (c) => c.json(listCredits(db, c.req.valid('param').id)),
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
        .put(
            '/libraries/:id/drafts/classification',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                classificationBody.extend({ folder: z.string().min(1) }),
            ),
            (c) => {
                const {
                    folder,
                    sources: links,
                    ...changes
                } = c.req.valid('json');
                checkFormatId(db, changes.formatId);
                const { formatId, age, sources } = files.setDraftSettings(
                    c.req.valid('param').id,
                    folder,
                    {
                        ...changes,
                        ...(links && { sources: sourcesText(links) }),
                    },
                );
                return c.json({
                    formatId,
                    age,
                    sources: parseSources(sources),
                });
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
            async (c) => {
                const { folder } = c.req.valid('query');
                return c.json(
                    // Long la première fois : les archives sont ouvertes.
                    await scanner.tasks.run(
                        `Lecture des brouillons « ${folder.replace(/^_draft\/?/, '') || '_draft'} »`,
                        () =>
                            files.draftFolder(c.req.valid('param').id, folder),
                    ),
                );
            },
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
        // Compression des pages, un fichier à la fois (le client avance seul).
        .post(
            '/libraries/:id/files/compression/estimate',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    paths: z.array(z.string().min(1)).min(1).max(2000),
                }),
            ),
            async (c) =>
                c.json(
                    await files.estimateCompression(
                        c.req.valid('param').id,
                        c.req.valid('json').paths,
                        settings.get().compression,
                    ),
                ),
        )
        // Compression en arrière-plan : ajout à la file, puis suivi.
        .post(
            '/libraries/:id/files/compress',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({ paths: z.array(z.string().min(1)).min(1) }),
            ),
            (c) =>
                c.json(
                    compression.add(
                        c.req.valid('param').id,
                        c.req.valid('json').paths,
                    ),
                ),
        )
        // Tâches de fond en cours (scan, compression…), pour l'icône de l'en-tête.
        .get('/tasks', requireAdmin, (c) => c.json(scanner.tasks.list()))
        .get('/compression', requireAdmin, (c) => c.json(compression.status()))
        // Réglages de l'admin, avec leurs valeurs par défaut.
        .get('/settings', requireAdmin, (c) =>
            c.json({ settings: settings.get(), defaults: settings.defaults }),
        )
        .put(
            '/settings',
            requireAdmin,
            zValidator('json', settingsUpdateSchema),
            (c) =>
                c.json({
                    settings: settings.update(c.req.valid('json')),
                    defaults: settings.defaults,
                }),
        )
        .delete('/compression', requireAdmin, (c) =>
            c.json(compression.clear()),
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
            async (c) => {
                const { paths } = c.req.valid('json');
                return c.json(
                    await scanner.tasks.run(
                        `Publication de ${paths.length} tome(s)`,
                        () => files.publish(c.req.valid('param').id, paths),
                    ),
                );
            },
        )
        // Comptes et contrôle parental (admin).
        .get('/users', requireAdmin, (c) => c.json(listUsers(db)))
        // Gestion des séries (admin) : toutes, et le nombre à classer.
        .get('/manage/series', requireAdmin, (c) =>
            c.json(listManagedSeries(db)),
        )
        .get('/manage/series/to-classify', requireAdmin, (c) =>
            c.json({ count: countToClassify(db) }),
        )
        .patch(
            '/users/:id',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    maxAge: z
                        .number()
                        .int()
                        .min(0)
                        .max(18)
                        .nullable()
                        .optional(),
                    role: z.enum(['admin', 'reader']).optional(),
                }),
            ),
            (c) =>
                c.json(
                    updateUser(
                        db,
                        c.req.valid('param').id,
                        c.req.valid('json'),
                        c.var.user.id,
                    ),
                ),
        )
        .delete(
            '/users/:id',
            requireAdmin,
            zValidator('param', idParam),
            (c) => {
                deleteUser(db, c.req.valid('param').id, c.var.user.id);
                return c.json({ ok: true as const });
            },
        )
        // Lien d'activation ou de nouveau mot de passe d'un compte.
        .post(
            '/users/:id/link',
            requireAdmin,
            zValidator('param', idParam),
            (c) => {
                const { token, expiresAt } = createUserLink(
                    db,
                    c.req.valid('param').id,
                );
                return c.json({ token, expiresAt });
            },
        )
        // Migration depuis Kavita (admin) : sa base, puis l'import choisi.
        .get('/migration/kavita', requireAdmin, async (c) =>
            c.json(
                (await kavita.hasFiles())
                    ? { analysis: kavita.analyze() }
                    : { analysis: null },
            ),
        )
        .post('/migration/kavita', requireAdmin, async (c) => {
            const body = await c.req.parseBody({ all: true });
            const sent = [body.files ?? []].flat();
            const files = await Promise.all(
                sent
                    .filter((f): f is File => f instanceof File)
                    .map(async (f) => ({
                        name: f.name,
                        data: new Uint8Array(await f.arrayBuffer()),
                    })),
            );
            await kavita.save(files);
            return c.json({ analysis: kavita.analyze() });
        })
        .post(
            '/migration/kavita/apply',
            requireAdmin,
            zValidator(
                'json',
                z.object({
                    accounts: z.array(
                        z.discriminatedUnion('action', [
                            z.object({
                                kavitaId: z.number().int(),
                                action: z.literal('link'),
                                userId: z.number().int(),
                            }),
                            z.object({
                                kavitaId: z.number().int(),
                                action: z.literal('create'),
                                name: z.string().trim().min(1).max(100),
                                maxAge: z
                                    .number()
                                    .int()
                                    .min(0)
                                    .max(18)
                                    .nullable(),
                            }),
                            z.object({
                                kavitaId: z.number().int(),
                                action: z.literal('skip'),
                            }),
                        ]),
                    ),
                    addedDates: z.boolean(),
                    readingTime: z.boolean(),
                    estimatedSessions: z.boolean(),
                    fillGaps: z.boolean().default(false),
                }),
            ),
            async (c) => {
                if (!(await kavita.hasFiles())) {
                    throw badRequest('Envoie d’abord la base de Kavita');
                }
                return c.json(kavita.apply(c.req.valid('json')));
            },
        )
        .delete('/migration/kavita', requireAdmin, async (c) => {
            await kavita.clear();
            return c.json({ ok: true as const });
        })
        // Invitations à créer un compte (admin).
        .get('/invitations', requireAdmin, (c) => c.json(listInvitations(db)))
        .post(
            '/invitations',
            requireAdmin,
            zValidator(
                'json',
                z.object({
                    role: z.enum(['admin', 'reader']),
                    maxAge: z.number().int().min(0).max(18).nullable(),
                    username: z.string().max(100).nullable().optional(),
                }),
            ),
            (c) => {
                const { id, token, expiresAt } = createInvitation(
                    db,
                    c.req.valid('json'),
                );
                return c.json({ id, token, expiresAt });
            },
        )
        .delete(
            '/invitations/:id',
            requireAdmin,
            zValidator('param', idParam),
            (c) => {
                deleteInvitation(db, c.req.valid('param').id);
                return c.json({ ok: true as const });
            },
        );

export type ApiType = ReturnType<typeof createApi>;
