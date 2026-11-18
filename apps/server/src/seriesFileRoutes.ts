import { Hono } from 'hono';
import { z } from 'zod';

import { type AuthEnv, requireAdmin } from './auth/routes';
import type { LibraryFiles } from './library/files';
import { zValidator } from './tools/validator';

const idParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * Fichiers d'une série ou d'un brouillon mis de côté, supprimés ou remis en
 * brouillon (admin), à part de `api.ts` : sa chaîne de routes est trop
 * longue pour TypeScript.
 */
export const createSeriesFileRoutes = (files: LibraryFiles) =>
    new Hono<AuthEnv>()
        // Brouillon archivé (liste repliée), ou de nouveau en attente.
        .put(
            '/libraries/:id/drafts/archive',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    folder: z.string().min(1),
                    archived: z.boolean(),
                }),
            ),
            (c) => {
                const { folder, archived } = c.req.valid('json');
                files.archiveDraft(c.req.valid('param').id, folder, archived);
                return c.json({ archived });
            },
        )
        // Brouillons d'une même série réunis dans un dossier.
        .post(
            '/libraries/:id/drafts/merge',
            requireAdmin,
            zValidator('param', idParam),
            zValidator(
                'json',
                z.object({
                    into: z.string().min(1),
                    from: z.array(z.string().min(1)).min(1),
                }),
            ),
            async (c) => {
                const { into, from } = c.req.valid('json');
                return c.json(
                    await files.mergeDrafts(
                        c.req.valid('param').id,
                        into,
                        from,
                    ),
                );
            },
        )
        // Brouillon supprimé du disque, pour de bon.
        .delete(
            '/libraries/:id/drafts',
            requireAdmin,
            zValidator('param', idParam),
            zValidator('query', z.object({ folder: z.string().min(1) })),
            async (c) =>
                c.json(
                    await files.deleteDraft(
                        c.req.valid('param').id,
                        c.req.valid('query').folder,
                    ),
                ),
        )
        // Série remise en brouillon : ses fichiers vont dans `_draft`.
        .post(
            '/series/:id/draft',
            requireAdmin,
            zValidator('param', idParam),
            async (c) =>
                c.json(await files.seriesToDraft(c.req.valid('param').id)),
        )
        // Série supprimée du disque (ses fichiers), pour de bon.
        .delete(
            '/series/:id/files',
            requireAdmin,
            zValidator('param', idParam),
            async (c) =>
                c.json(await files.deleteSeries(c.req.valid('param').id)),
        );
