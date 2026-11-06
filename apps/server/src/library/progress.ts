import { and, desc, eq, sql } from 'drizzle-orm';

import type { Db } from '../db';
import { readProgress, series, volumes } from '../db/schema';
import { notFound } from '../tools/errors';
import { volumeOrder, volumeVersion } from './catalog';
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

/**
 * Tomes commencés et pas finis, du plus récemment lu au plus ancien : un
 * seul par série, avec l'avancement dans la série (tomes lus sur le total).
 */
export const listInProgress = (db: Db, viewer: Viewer, limit = 12) => {
    return db
        .select({
            volumeId: volumes.id,
            version: volumeVersion,
            seriesId: series.id,
            seriesName: series.name,
            number: volumes.number,
            title: volumes.title,
            page: readProgress.page,
            pageCount: volumes.pageCount,
            updatedAt: readProgress.updatedAt,
            // SQL brut : Drizzle ne préfixerait pas les colonnes par leur table.
            volumeCount: sql<number>`(select count(*) from volumes v where v.series_id = series.id)`,
            readCount: sql<number>`(select count(*) from read_progress rp join volumes v on v.id = rp.volume_id where v.series_id = series.id and rp.user_id = ${viewer.id} and rp.completed = 1)`,
        })
        .from(readProgress)
        .innerJoin(volumes, eq(volumes.id, readProgress.volumeId))
        .innerJoin(series, eq(series.id, volumes.seriesId))
        .where(
            and(
                eq(readProgress.userId, viewer.id),
                eq(readProgress.completed, false),
                visibleTo(viewer),
                // Seul le tome en cours le plus récent de sa série : les
                // comptes ci-dessus ne sont faits que pour les lignes gardées.
                sql`not exists (select 1 from read_progress rp join volumes v on v.id = rp.volume_id where v.series_id = series.id and rp.user_id = ${viewer.id} and rp.completed = 0 and (rp.updated_at > read_progress.updated_at or (rp.updated_at = read_progress.updated_at and rp.volume_id > read_progress.volume_id)))`,
            ),
        )
        .orderBy(desc(readProgress.updatedAt))
        .limit(limit)
        .all();
};

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

/**
 * Derniers ajouts : le tome le plus récent de chaque série, des séries
 * enrichies le plus récemment aux plus anciennes.
 */
export const listRecentVolumes = (db: Db, viewer: Viewer, limit = 12) => {
    const rows = db
        .select({
            volumeId: volumes.id,
            version: volumeVersion,
            seriesId: series.id,
            seriesName: series.name,
            number: volumes.number,
            title: volumes.title,
            addedAt: volumes.addedAt,
        })
        .from(volumes)
        .innerJoin(series, eq(series.id, volumes.seriesId))
        .where(visibleTo(viewer))
        .orderBy(desc(volumes.addedAt), desc(volumes.sortNumber))
        .all();
    const seen = new Set<number>();
    return rows
        .filter((row) => !seen.has(row.seriesId) && seen.add(row.seriesId))
        .slice(0, limit);
};

/**
 * Suite des séries entamées : le premier tome pas encore ouvert des séries
 * dont la personne a fini au moins un tome, sans tome en cours (ceux-là
 * sont dans `listInProgress`). Séries lues le plus récemment d'abord.
 */
export const listNextVolumes = (db: Db, viewer: Viewer, limit = 12) => {
    const rows = db
        .select({
            volumeId: volumes.id,
            version: volumeVersion,
            seriesId: series.id,
            seriesName: series.name,
            number: volumes.number,
            title: volumes.title,
            pageCount: volumes.pageCount,
            completed: readProgress.completed,
            updatedAt: readProgress.updatedAt,
        })
        .from(volumes)
        .innerJoin(series, eq(series.id, volumes.seriesId))
        .leftJoin(
            readProgress,
            and(
                eq(readProgress.volumeId, volumes.id),
                eq(readProgress.userId, viewer.id),
            ),
        )
        .where(
            and(
                visibleTo(viewer),
                sql`${volumes.seriesId} in (select v.series_id from read_progress rp join volumes v on v.id = rp.volume_id where rp.user_id = ${viewer.id} and rp.completed = 1)`,
            ),
        )
        .orderBy(...volumeOrder)
        .all();
    const bySeries = new Map<number, typeof rows>();
    for (const row of rows) {
        bySeries.set(row.seriesId, [
            ...(bySeries.get(row.seriesId) ?? []),
            row,
        ]);
    }
    const next = [];
    for (const items of bySeries.values()) {
        if (items.some((v) => v.updatedAt && !v.completed)) continue;
        const unread = items.find((v) => !v.updatedAt);
        if (!unread) continue;
        const {
            completed: _completed,
            updatedAt: _updatedAt,
            ...volume
        } = unread;
        next.push({
            ...volume,
            // Pas encore ouvert.
            page: null,
            // Date de la dernière lecture dans la série.
            updatedAt: new Date(
                Math.max(...items.map((v) => v.updatedAt?.getTime() ?? 0)),
            ),
            volumeCount: items.length,
            readCount: items.filter((v) => v.completed).length,
        });
    }
    return next
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, limit);
};

/**
 * « Reprendre la lecture » : dans chaque série entamée, le tome en cours ou,
 * à défaut, le suivant à ouvrir. Du plus récemment lu au plus ancien.
 */
export const listContinue = (db: Db, viewer: Viewer, limit = 12) =>
    [
        ...listInProgress(db, viewer, limit),
        ...listNextVolumes(db, viewer, limit),
    ]
        // Tri stable : à date égale, le tome en cours d'abord.
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, limit);
