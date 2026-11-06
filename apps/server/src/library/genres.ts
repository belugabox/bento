import { asc, eq } from 'drizzle-orm';

import { type GenreEntry, classify, genreKey } from '../classification';
import type { Db } from '../db';
import { genres, series } from '../db/schema';
import { badRequest, conflict, notFound } from '../tools/errors';

/** Liste des genres, pour ranger ceux des fichiers (`classify`). */
export const genreCatalog = (db: Db): GenreEntry[] =>
    db
        .select({ name: genres.name, aliases: genres.aliases })
        .from(genres)
        .orderBy(asc(genres.name))
        .all();

/** Liste des genres, avec le nombre de séries de chacun (gestion). */
export const listGenres = (db: Db) => {
    const rows = db.select().from(genres).all();
    const counts = new Map<string, number>();
    const catalog = rows.map(({ name, aliases }) => ({ name, aliases }));
    for (const { genre, tags } of db
        .select({ genre: series.genre, tags: series.tags })
        .from(series)
        .all()) {
        for (const name of classify(genre, tags, catalog).genres) {
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
    }
    return rows
        .map((row) => ({ ...row, seriesCount: counts.get(row.name) ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
};

/** Nom et alias nettoyés : sans doublons ni l'alias égal au nom. */
const cleanEntry = ({ name, aliases }: GenreEntry): GenreEntry => {
    const trimmed = name.trim();
    if (!genreKey(trimmed)) throw badRequest('Nom de genre requis');
    const seen = new Set([genreKey(trimmed)]);
    const kept: string[] = [];
    for (const alias of aliases.map((a) => a.trim())) {
        const key = genreKey(alias);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        kept.push(alias);
    }
    return { name: trimmed, aliases: kept };
};

/** Refuse un nom ou un alias déjà pris par un autre genre. */
const checkFree = (db: Db, entry: GenreEntry, exceptId?: number) => {
    const taken = new Map<string, string>();
    for (const row of db.select().from(genres).all()) {
        if (row.id === exceptId) continue;
        for (const value of [row.name, ...row.aliases]) {
            taken.set(genreKey(value), row.name);
        }
    }
    for (const value of [entry.name, ...entry.aliases]) {
        const owner = taken.get(genreKey(value));
        if (owner)
            throw conflict(`« ${value} » est déjà reconnu par « ${owner} »`);
    }
};

export const createGenre = (db: Db, entry: GenreEntry) => {
    const clean = cleanEntry(entry);
    checkFree(db, clean);
    return db.insert(genres).values(clean).returning().get();
};

/**
 * Renomme un genre ou change ses alias. L'ancien nom devient un alias :
 * les fichiers qui le portent restent rangés dans ce genre.
 */
export const updateGenre = (
    db: Db,
    id: number,
    changes: Partial<GenreEntry>,
) => {
    const current = db.select().from(genres).where(eq(genres.id, id)).get();
    if (!current) throw notFound('Genre introuvable');
    const name = changes.name ?? current.name;
    const aliases = changes.aliases ?? current.aliases;
    const clean = cleanEntry({
        name,
        aliases:
            genreKey(name) === genreKey(current.name)
                ? aliases
                : [...aliases, current.name],
    });
    checkFree(db, clean, id);
    return db
        .update(genres)
        .set(clean)
        .where(eq(genres.id, id))
        .returning()
        .get()!;
};

/**
 * Supprime un genre. Avec `into`, il est fusionné dans un autre : son nom
 * et ses alias y deviennent des alias. Sinon, les séries qui le portent
 * le gardent comme thème.
 */
export const deleteGenre = (db: Db, id: number, into?: number) =>
    db.transaction((tx) => {
        const current = tx.select().from(genres).where(eq(genres.id, id)).get();
        if (!current) throw notFound('Genre introuvable');
        if (into !== undefined) {
            if (into === id)
                throw badRequest('Un genre ne fusionne pas en lui-même');
            const target = tx
                .select()
                .from(genres)
                .where(eq(genres.id, into))
                .get();
            if (!target) throw notFound('Genre de destination introuvable');
            tx.update(genres)
                .set(
                    cleanEntry({
                        name: target.name,
                        aliases: [
                            ...target.aliases,
                            current.name,
                            ...current.aliases,
                        ],
                    }),
                )
                .where(eq(genres.id, into))
                .run();
        }
        tx.delete(genres).where(eq(genres.id, id)).run();
        return { deleted: id };
    });
