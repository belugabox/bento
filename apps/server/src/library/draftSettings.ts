import { and, eq } from 'drizzle-orm';

import type { Db } from '../db';
import { draftSettings } from '../db/schema';
import { notFound } from '../tools/errors';
import { isDraft } from './paths';

export type DraftSettings = Pick<
    typeof draftSettings.$inferSelect,
    'status' | 'readingMode' | 'format' | 'audience' | 'coverUpdatedAt'
>;

const NONE: DraftSettings = {
    status: null,
    readingMode: null,
    format: null,
    audience: null,
    coverUpdatedAt: null,
};

/** Refuse un dossier hors de `_draft` (« _draft/../Gantz »). */
export const checkDraftFolder = (folder: string) => {
    if (!isDraft(folder) || folder.split('/').includes('..')) {
        throw notFound('Dossier de brouillons introuvable');
    }
};

/** Réglages des dossiers de brouillons d'une bibliothèque, par dossier. */
export const draftSettingsOf = (db: Db, libraryId: number) =>
    new Map(
        db
            .select()
            .from(draftSettings)
            .where(eq(draftSettings.libraryId, libraryId))
            .all()
            .map(({ libraryId: _library, folder, ...settings }) => [
                folder,
                settings as DraftSettings,
            ]),
    );

/**
 * Modifie les réglages d'un dossier de brouillons ; la ligne disparaît
 * quand il n'en reste aucun.
 */
export const saveDraftSettings = (
    db: Db,
    libraryId: number,
    folder: string,
    changes: Partial<DraftSettings>,
): DraftSettings => {
    checkDraftFolder(folder);
    const where = and(
        eq(draftSettings.libraryId, libraryId),
        eq(draftSettings.folder, folder),
    );
    const current = draftSettingsOf(db, libraryId).get(folder) ?? NONE;
    const next = { ...current, ...changes };
    if (Object.values(next).every((value) => value === null)) {
        db.delete(draftSettings).where(where).run();
    } else {
        db.insert(draftSettings)
            .values({ libraryId, folder, ...next })
            .onConflictDoUpdate({
                target: [draftSettings.libraryId, draftSettings.folder],
                set: next,
            })
            .run();
    }
    return next;
};

export const deleteDraftSettings = (
    db: Db,
    libraryId: number,
    folder: string,
) =>
    db
        .delete(draftSettings)
        .where(
            and(
                eq(draftSettings.libraryId, libraryId),
                eq(draftSettings.folder, folder),
            ),
        )
        .run();
