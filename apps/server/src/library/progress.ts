import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { Db } from '../db';
import { readProgress, series, volumes } from '../db/schema';
import { notFound } from '../tools/errors';
import { countedVolume, volumeOrder, volumeVersion } from './catalog';
import { type Viewer, visibleTo } from './visibility';
import { isMainKind } from './volumeKind';

export type Progress = { page: number; completed: boolean };

/**
 * Progression exacte d'un tome (date comprise : l'ordre de « Reprendre la
 * lecture » en dépend), pour annuler une action ; null = pas commencé.
 */
export type SavedProgress = {
    volumeId: number;
    progress: (Progress & { updatedAt: number }) | null;
};

/** Progression actuelle de tomes, telle qu'il faudra la remettre. */
export const snapshotProgress = (
    db: Db,
    userId: number,
    volumeIds: number[],
): SavedProgress[] => {
    const rows = new Map(
        db
            .select()
            .from(readProgress)
            .where(
                and(
                    eq(readProgress.userId, userId),
                    inArray(readProgress.volumeId, volumeIds),
                ),
            )
            .all()
            .map((row) => [row.volumeId, row]),
    );
    return volumeIds.map((volumeId) => {
        const row = rows.get(volumeId);
        return {
            volumeId,
            progress: row
                ? {
                      page: row.page,
                      completed: row.completed,
                      updatedAt: row.updatedAt.getTime(),
                  }
                : null,
        };
    });
};

/**
 * Remet la progression de tomes à l'identique (annulation d'une action).
 * Les tomes masqués à la personne sont ignorés.
 */
export const restoreProgress = (
    db: Db,
    viewer: Viewer,
    items: SavedProgress[],
) => {
    const visible = new Set(
        db
            .select({ id: volumes.id })
            .from(volumes)
            .innerJoin(series, eq(series.id, volumes.seriesId))
            .where(
                and(
                    inArray(
                        volumes.id,
                        items.map((item) => item.volumeId),
                    ),
                    visibleTo(viewer),
                ),
            )
            .all()
            .map((v) => v.id),
    );
    db.transaction((tx) => {
        for (const { volumeId, progress } of items) {
            if (!visible.has(volumeId)) continue;
            const where = and(
                eq(readProgress.userId, viewer.id),
                eq(readProgress.volumeId, volumeId),
            );
            if (!progress) {
                tx.delete(readProgress).where(where).run();
                continue;
            }
            const values = {
                page: progress.page,
                completed: progress.completed,
                updatedAt: new Date(progress.updatedAt),
            };
            tx.insert(readProgress)
                .values({ userId: viewer.id, volumeId, ...values })
                .onConflictDoUpdate({
                    target: [readProgress.userId, readProgress.volumeId],
                    set: values,
                })
                .run();
        }
    });
    return { restored: items.filter((i) => visible.has(i.volumeId)).length };
};

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
            kind: volumes.kind,
            title: volumes.title,
            page: readProgress.page,
            pageCount: volumes.pageCount,
            updatedAt: readProgress.updatedAt,
            // SQL brut : Drizzle ne préfixerait pas les colonnes par leur table.
            volumeCount: sql<number>`(select count(*) from volumes v where v.series_id = series.id and ${countedVolume('v')})`,
            readCount: sql<number>`(select count(*) from volumes v cross join read_progress rp on rp.volume_id = v.id and rp.user_id = ${viewer.id} where v.series_id = series.id and rp.completed = 1 and ${countedVolume('v')})`,
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
                sql`not exists (select 1 from volumes v cross join read_progress rp on rp.volume_id = v.id and rp.user_id = ${viewer.id} where v.series_id = series.id and rp.completed = 0 and (rp.updated_at > read_progress.updated_at or (rp.updated_at = read_progress.updated_at and rp.volume_id > read_progress.volume_id)))`,
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
    upTo?: number,
) => {
    const all = db
        .select({ id: volumes.id })
        .from(volumes)
        .innerJoin(series, eq(series.id, volumes.seriesId))
        .where(and(eq(series.id, seriesId), visibleTo(viewer)))
        .orderBy(...volumeOrder)
        .all()
        .map((v) => v.id);
    if (all.length === 0) throw notFound('Série introuvable');
    // « Jusqu'au tome » : ce tome et ceux d'avant, dans l'ordre de la série.
    const last = upTo === undefined ? all.length - 1 : all.indexOf(upTo);
    if (last < 0) throw notFound('Tome introuvable dans cette série');
    const ids = all.slice(0, last + 1);
    const previous = snapshotProgress(db, viewer.id, ids);
    for (const id of ids) {
        saveProgress(db, viewer.id, id, { completed: read });
    }
    return { volumes: ids.length, read, previous };
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
            kind: volumes.kind,
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
            kind: volumes.kind,
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
        // Comptés : les tomes, sans hors-séries ni spéciaux (voir
        // `countedVolume`).
        const regular = items.filter((v) => isMainKind(v.kind));
        const counted = regular.length > 0 ? regular : items;
        next.push({
            ...volume,
            // Pas encore ouvert.
            page: null,
            // Date de la dernière lecture dans la série.
            updatedAt: new Date(
                Math.max(...items.map((v) => v.updatedAt?.getTime() ?? 0)),
            ),
            volumeCount: counted.length,
            readCount: counted.filter((v) => v.completed).length,
        });
    }
    return next
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, limit);
};

/**
 * « Reprendre la lecture » : dans chaque série entamée, le tome en cours ou,
 * à défaut, le suivant à ouvrir. Du plus récemment lu au plus ancien.
 * Toutes par défaut : l'accueil les met en tête de sa grille (12 au plus
 * laissait les autres séries entamées au milieu des autres).
 */
export const listContinue = (
    db: Db,
    viewer: Viewer,
    limit = Number.MAX_SAFE_INTEGER,
) =>
    [
        ...listInProgress(db, viewer, limit),
        ...listNextVolumes(db, viewer, limit),
    ]
        // Tri stable : à date égale, le tome en cours d'abord.
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, limit);
