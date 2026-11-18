import { and, eq, inArray } from 'drizzle-orm';

import type { Db } from '../db';
import { series, seriesLists } from '../db/schema';
import { notFound } from '../tools/errors';
import { type Viewer, visibleTo } from './visibility';

/** Série visible pour la personne, sinon introuvable. */
const checkVisible = (db: Db, viewer: Viewer, seriesId: number) => {
    const row = db
        .select({ id: series.id })
        .from(series)
        .where(and(eq(series.id, seriesId), visibleTo(viewer)))
        .get();
    if (!row) throw notFound('Série introuvable');
};

/**
 * Ajoute ou retire une série de la liste « à lire », ou de « pas pour
 * moi » (retirée des suggestions). (Les favoris ont été retirés le
 * 6 novembre 2026 ; leurs lignes restent en base, ignorées.)
 */
export const setSeriesLists = (
    db: Db,
    viewer: Viewer,
    seriesId: number,
    changes: { toRead?: boolean; notForMe?: boolean; rereading?: boolean },
) => {
    checkVisible(db, viewer, seriesId);
    const lists = [
        ['toread', changes.toRead],
        ['notforme', changes.notForMe],
        ['rereading', changes.rereading],
    ] as const;
    for (const [list, member] of lists) {
        if (member === undefined) continue;
        // Une relecture recommencée repart de maintenant.
        if (member && list === 'rereading') {
            db.delete(seriesLists)
                .where(
                    and(
                        eq(seriesLists.userId, viewer.id),
                        eq(seriesLists.seriesId, seriesId),
                        eq(seriesLists.list, list),
                    ),
                )
                .run();
        }
        if (member) {
            db.insert(seriesLists)
                .values({
                    userId: viewer.id,
                    seriesId,
                    list,
                    // L'heure du serveur (début d'une relecture).
                    addedAt: new Date(),
                })
                .onConflictDoNothing()
                .run();
        } else {
            db.delete(seriesLists)
                .where(
                    and(
                        eq(seriesLists.userId, viewer.id),
                        eq(seriesLists.seriesId, seriesId),
                        eq(seriesLists.list, list),
                    ),
                )
                .run();
        }
    }
    const kept = db
        .select({ list: seriesLists.list })
        .from(seriesLists)
        .where(
            and(
                eq(seriesLists.userId, viewer.id),
                eq(seriesLists.seriesId, seriesId),
            ),
        )
        .all()
        .map((row) => row.list);
    return {
        toRead: kept.includes('toread'),
        notForMe: kept.includes('notforme'),
        rereading: kept.includes('rereading'),
    };
};

/**
 * Listes d'une série, gardées pour être reportées sur la série qui la
 * remplace (renommée à la publication : nouveau dossier).
 */
export const listsSnapshot = (db: Db, seriesId: number) => ({
    lists: db
        .select({ userId: seriesLists.userId, list: seriesLists.list })
        .from(seriesLists)
        .where(
            and(
                eq(seriesLists.seriesId, seriesId),
                inArray(seriesLists.list, ['toread', 'notforme']),
            ),
        )
        .all(),
});

export const restoreLists = (
    db: Db,
    seriesId: number,
    snapshot: ReturnType<typeof listsSnapshot>,
) => {
    for (const { userId, list } of snapshot.lists) {
        db.insert(seriesLists)
            .values({ userId, seriesId, list })
            .onConflictDoNothing()
            .run();
    }
};
