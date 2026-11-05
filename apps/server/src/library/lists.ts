import { and, asc, eq, sql } from 'drizzle-orm';

import type { Db } from '../db';
import {
    collectionSeries,
    collections,
    series,
    seriesLists,
} from '../db/schema';
import { conflict, notFound } from '../tools/errors';
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

/** Ajoute ou retire une série des favoris et de la liste « à lire ». */
export const setSeriesLists = (
    db: Db,
    viewer: Viewer,
    seriesId: number,
    changes: { favorite?: boolean; toRead?: boolean },
) => {
    checkVisible(db, viewer, seriesId);
    const lists = [
        ['favorite', changes.favorite],
        ['toread', changes.toRead],
    ] as const;
    for (const [list, member] of lists) {
        if (member === undefined) continue;
        if (member) {
            db.insert(seriesLists)
                .values({ userId: viewer.id, seriesId, list })
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
        favorite: kept.includes('favorite'),
        toRead: kept.includes('toread'),
    };
};

/** Collections, avec le nombre de séries que la personne y voit. */
export const listCollections = (db: Db, viewer: Viewer) =>
    db
        .select({
            id: collections.id,
            name: collections.name,
            seriesCount: sql<number>`count(${series.id})`,
        })
        .from(collections)
        .leftJoin(
            collectionSeries,
            eq(collectionSeries.collectionId, collections.id),
        )
        .leftJoin(
            series,
            and(eq(series.id, collectionSeries.seriesId), visibleTo(viewer)),
        )
        .groupBy(collections.id)
        .orderBy(sql`${collections.name} collate nocase`, asc(collections.id))
        .all();

const checkCollection = (db: Db, id: number) => {
    const row = db
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.id, id))
        .get();
    if (!row) throw notFound('Collection introuvable');
};

const sameName = (db: Db, name: string, exceptId?: number) =>
    db
        .select({ id: collections.id })
        .from(collections)
        .where(sql`lower(${collections.name}) = lower(${name})`)
        .all()
        .some((row) => row.id !== exceptId);

export const createCollection = (db: Db, name: string) => {
    if (sameName(db, name)) throw conflict('Cette collection existe déjà');
    return db
        .insert(collections)
        .values({ name })
        .returning({ id: collections.id, name: collections.name })
        .get();
};

export const renameCollection = (db: Db, id: number, name: string) => {
    checkCollection(db, id);
    if (sameName(db, name, id)) {
        throw conflict('Cette collection existe déjà');
    }
    db.update(collections).set({ name }).where(eq(collections.id, id)).run();
    return { id, name };
};

export const deleteCollection = (db: Db, id: number) => {
    checkCollection(db, id);
    db.delete(collections).where(eq(collections.id, id)).run();
    return { id };
};

/** Ajoute ou retire une série d'une collection. */
export const setCollectionMember = (
    db: Db,
    collectionId: number,
    seriesId: number,
    member: boolean,
) => {
    checkCollection(db, collectionId);
    checkVisible(db, { id: 0, role: 'admin', maxAge: null }, seriesId);
    if (member) {
        db.insert(collectionSeries)
            .values({ collectionId, seriesId })
            .onConflictDoNothing()
            .run();
    } else {
        db.delete(collectionSeries)
            .where(
                and(
                    eq(collectionSeries.collectionId, collectionId),
                    eq(collectionSeries.seriesId, seriesId),
                ),
            )
            .run();
    }
    return { collectionId, seriesId, member };
};

/**
 * Listes et collections d'une série, gardées pour être reportées sur la
 * série qui la remplace (renommée à la publication : nouveau dossier).
 */
export const listsSnapshot = (db: Db, seriesId: number) => ({
    lists: db
        .select({ userId: seriesLists.userId, list: seriesLists.list })
        .from(seriesLists)
        .where(eq(seriesLists.seriesId, seriesId))
        .all(),
    collectionIds: db
        .select({ id: collectionSeries.collectionId })
        .from(collectionSeries)
        .where(eq(collectionSeries.seriesId, seriesId))
        .all()
        .map((row) => row.id),
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
    for (const collectionId of snapshot.collectionIds) {
        db.insert(collectionSeries)
            .values({ collectionId, seriesId })
            .onConflictDoNothing()
            .run();
    }
};
