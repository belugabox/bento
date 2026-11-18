import { and, eq, inArray } from 'drizzle-orm';

import type { Db } from '../db';
import { readProgress, series, seriesLists, volumes } from '../db/schema';
import { volumeOrder, volumeVersion } from './catalog';
import { type Viewer, visibleTo } from './visibility';
import { isMainKind } from './volumeKind';

/**
 * Relecture (demandée : « Relire » une série lue, choix B) : gardée dans les
 * listes personnelles (`rereading`), sa date d'ajout est son début. Un tome
 * ouvert depuis est relu (ou en cours de relecture) ; « En cours » propose
 * le premier qui ne l'est pas encore. Elle s'arrête au dernier tome relu,
 * ou à la demande.
 */
const startsOf = (db: Db, userId: number, seriesIds?: number[]) =>
    new Map(
        db
            .select({
                seriesId: seriesLists.seriesId,
                start: seriesLists.addedAt,
            })
            .from(seriesLists)
            .where(
                and(
                    eq(seriesLists.userId, userId),
                    eq(seriesLists.list, 'rereading'),
                    seriesIds
                        ? inArray(seriesLists.seriesId, seriesIds)
                        : undefined,
                ),
            )
            .all()
            .map((row) => [row.seriesId, row.start.getTime()]),
    );

type Row = {
    volumeId: number;
    version: number;
    seriesId: number;
    seriesName: string;
    number: string | null;
    kind: (typeof volumes.$inferSelect)['kind'];
    group: string | null;
    title: string | null;
    pageCount: number;
    completed: boolean | null;
    page: number | null;
    updatedAt: Date | null;
};

/** Tomes des séries relues, dans leur ordre, avec la lecture de la personne. */
const rowsOf = (db: Db, viewer: Viewer, seriesIds: number[]): Row[] =>
    db
        .select({
            volumeId: volumes.id,
            version: volumeVersion,
            seriesId: series.id,
            seriesName: series.name,
            number: volumes.number,
            kind: volumes.kind,
            group: volumes.group,
            title: volumes.title,
            pageCount: volumes.pageCount,
            completed: readProgress.completed,
            page: readProgress.page,
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
        .where(and(visibleTo(viewer), inArray(volumes.seriesId, seriesIds)))
        .orderBy(...volumeOrder)
        .all();

/**
 * Où en est la relecture d'une série : le tome relu en ce moment (ouvert
 * depuis le début, pas fini), sinon le premier pas encore relu ; rien
 * quand tout est relu.
 */
const positionOf = (items: Row[], start: number) => {
    // Début gardé à la seconde : une lecture de la même seconde est d'avant.
    const touched = (v: Row) =>
        !!v.updatedAt && v.updatedAt.getTime() >= start + 1000;
    const current = items.find(
        (v) =>
            touched(v) &&
            (!v.completed || (v.page ?? 0) < Math.max(v.pageCount - 1, 0)),
    );
    if (current) return { current, next: undefined };
    return { current: undefined, next: items.find((v) => !touched(v)) };
};

/**
 * Relectures de la personne, pour « En cours » : les séries relues, et pour
 * chacune sans tome en cours de relecture, le suivant à relire (comme un
 * tome suivant pas encore ouvert).
 */
export const listRereading = (db: Db, viewer: Viewer) => {
    const starts = startsOf(db, viewer.id);
    const next = [];
    if (starts.size > 0) {
        const bySeries = new Map<number, Row[]>();
        for (const row of rowsOf(db, viewer, [...starts.keys()])) {
            bySeries.set(row.seriesId, [
                ...(bySeries.get(row.seriesId) ?? []),
                row,
            ]);
        }
        for (const [seriesId, items] of bySeries) {
            const start = starts.get(seriesId)!;
            const { next: volume } = positionOf(items, start);
            if (!volume) continue;
            const counted = items.filter((v) => isMainKind(v.kind));
            const regular = counted.length > 0 ? counted : items;
            // Dernier tome relu (sinon le début) : l'ordre de « En cours ».
            const last = Math.max(
                start,
                ...items.map((v) => v.updatedAt?.getTime() ?? 0),
            );
            const {
                completed: _completed,
                updatedAt: _updatedAt,
                ...fields
            } = volume;
            next.push({
                ...fields,
                // Pas encore rouvert.
                page: null,
                updatedAt: new Date(last),
                volumeCount: regular.length,
                readCount: regular.filter((v) => v.completed).length,
                newCount: 0,
                rereading: true as const,
            });
        }
    }
    return { series: new Set(starts.keys()), next };
};

/** Prochain tome de la relecture d'une série (fiche série) ; null : aucune. */
export const rereadNextOf = (db: Db, viewer: Viewer, seriesId: number) => {
    const start = startsOf(db, viewer.id, [seriesId]).get(seriesId);
    if (start === undefined) return null;
    const { current, next } = positionOf(rowsOf(db, viewer, [seriesId]), start);
    return (current ?? next)?.volumeId ?? null;
};

/**
 * Après un tome lu jusqu'au bout : la relecture de sa série s'arrête quand
 * tous ses tomes sont relus.
 */
export const endRereadingIfDone = (
    db: Db,
    viewer: Viewer,
    volumeId: number,
) => {
    const volume = db
        .select({ seriesId: volumes.seriesId })
        .from(volumes)
        .where(eq(volumes.id, volumeId))
        .get();
    if (!volume) return;
    const start = startsOf(db, viewer.id, [volume.seriesId]).get(
        volume.seriesId,
    );
    if (start === undefined) return;
    const { current, next } = positionOf(
        rowsOf(db, viewer, [volume.seriesId]),
        start,
    );
    if (current || next) return;
    db.delete(seriesLists)
        .where(
            and(
                eq(seriesLists.userId, viewer.id),
                eq(seriesLists.seriesId, volume.seriesId),
                eq(seriesLists.list, 'rereading'),
            ),
        )
        .run();
};
