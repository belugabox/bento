import { and, desc, eq } from 'drizzle-orm';

import type { Db } from '../db';
import { readProgress, series, volumes } from '../db/schema';
import { notFound } from '../tools/errors';
import { type Viewer, visibleTo } from './visibility';

export type Progress = { page: number; completed: boolean };

export const getProgress = (
    db: Db,
    userId: number,
    volumeId: number,
): Progress | null =>
    db
        .select({ page: readProgress.page, completed: readProgress.completed })
        .from(readProgress)
        .where(
            and(
                eq(readProgress.userId, userId),
                eq(readProgress.volumeId, volumeId),
            ),
        )
        .get() ?? null;

/**
 * Enregistre où en est la personne. Atteindre la dernière page marque le
 * tome comme lu, et il le reste si on le relit ; `completed: false` le
 * remet à « non lu » (progression effacée), `completed: true` le marque lu.
 */
export const saveProgress = (
    db: Db,
    userId: number,
    volumeId: number,
    update: { page?: number; completed?: boolean },
): Progress | null => {
    const volume = db
        .select({ pageCount: volumes.pageCount })
        .from(volumes)
        .where(eq(volumes.id, volumeId))
        .get();
    if (!volume) throw notFound('Tome introuvable');
    const where = and(
        eq(readProgress.userId, userId),
        eq(readProgress.volumeId, volumeId),
    );

    if (update.completed === false) {
        db.delete(readProgress).where(where).run();
        return null;
    }

    const lastPage = Math.max(volume.pageCount - 1, 0);
    const page =
        update.completed === true
            ? lastPage
            : Math.min(update.page ?? 0, lastPage);
    const previous = getProgress(db, userId, volumeId);
    const progress = {
        page,
        completed:
            update.completed === true ||
            previous?.completed === true ||
            page >= lastPage,
    };
    db.insert(readProgress)
        .values({ userId, volumeId, ...progress, updatedAt: new Date() })
        .onConflictDoUpdate({
            target: [readProgress.userId, readProgress.volumeId],
            set: { ...progress, updatedAt: new Date() },
        })
        .run();
    return progress;
};

/** Tomes commencés et pas finis, du plus récemment lu au plus ancien. */
export const listInProgress = (db: Db, viewer: Viewer, limit = 12) =>
    db
        .select({
            volumeId: volumes.id,
            seriesId: series.id,
            seriesName: series.name,
            number: volumes.number,
            title: volumes.title,
            page: readProgress.page,
            pageCount: volumes.pageCount,
            updatedAt: readProgress.updatedAt,
        })
        .from(readProgress)
        .innerJoin(volumes, eq(volumes.id, readProgress.volumeId))
        .innerJoin(series, eq(series.id, volumes.seriesId))
        .where(
            and(
                eq(readProgress.userId, viewer.id),
                eq(readProgress.completed, false),
                visibleTo(viewer),
            ),
        )
        .orderBy(desc(readProgress.updatedAt))
        .limit(limit)
        .all();

/**
 * Marque tous les tomes d'une série comme lus (`read`) ou non lus
 * (progression effacée), pour la personne. Introuvable si la série lui
 * est masquée.
 */
export const markSeries = (
    db: Db,
    viewer: Viewer,
    seriesId: number,
    read: boolean,
) => {
    const ids = db
        .select({ id: volumes.id })
        .from(volumes)
        .innerJoin(series, eq(series.id, volumes.seriesId))
        .where(and(eq(series.id, seriesId), visibleTo(viewer)))
        .all()
        .map((v) => v.id);
    if (ids.length === 0) throw notFound('Série introuvable');
    for (const id of ids) {
        saveProgress(db, viewer.id, id, { completed: read });
    }
    return { volumes: ids.length, read };
};
