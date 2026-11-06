import { asc, count, eq } from 'drizzle-orm';

import { type FormatEntry, genreKey } from '../classification';
import type { Db } from '../db';
import { draftSettings, formats, series } from '../db/schema';
import { badRequest, conflict, notFound } from '../tools/errors';

/** Formats, avec le nombre de séries de chacun (gestion, éditeur). */
export const listFormats = (db: Db) =>
    db
        .select({
            id: formats.id,
            name: formats.name,
            readingMode: formats.readingMode,
            seriesCount: count(series.id),
        })
        .from(formats)
        .leftJoin(series, eq(series.formatId, formats.id))
        .groupBy(formats.id)
        .orderBy(asc(formats.id))
        .all();

/** Refuse un nom vide ou déjà pris (sans tenir compte de la casse). */
const checkName = (db: Db, name: string, exceptId?: number) => {
    const key = genreKey(name);
    if (!key) throw badRequest('Nom de format requis');
    const taken = db
        .select({ id: formats.id, name: formats.name })
        .from(formats)
        .all()
        .find((row) => row.id !== exceptId && genreKey(row.name) === key);
    if (taken) throw conflict(`Le format « ${taken.name} » existe déjà`);
};

export const createFormat = (db: Db, entry: FormatEntry) => {
    const name = entry.name.trim();
    checkName(db, name);
    return db
        .insert(formats)
        .values({ name, readingMode: entry.readingMode })
        .returning()
        .get();
};

/** Renomme un format ou change son mode de lecture. */
export const updateFormat = (
    db: Db,
    id: number,
    changes: Partial<FormatEntry>,
) => {
    const name = changes.name?.trim();
    if (name !== undefined) checkName(db, name, id);
    const updated = db
        .update(formats)
        .set({ ...changes, ...(name !== undefined && { name }) })
        .where(eq(formats.id, id))
        .returning()
        .get();
    if (!updated) throw notFound('Format introuvable');
    return updated;
};

/**
 * Supprime un format : ses séries et ses brouillons n'en ont plus (à
 * choisir de nouveau). Détachés ici : la clé étrangère n'a pas toujours
 * `on delete set null` (migration 0016 appliquée sans).
 */
export const deleteFormat = (db: Db, id: number) =>
    db.transaction((tx) => {
        tx.update(series)
            .set({ formatId: null })
            .where(eq(series.formatId, id))
            .run();
        tx.update(draftSettings)
            .set({ formatId: null })
            .where(eq(draftSettings.formatId, id))
            .run();
        const deleted = tx
            .delete(formats)
            .where(eq(formats.id, id))
            .returning({ id: formats.id })
            .get();
        if (!deleted) throw notFound('Format introuvable');
        return { deleted: id };
    });
