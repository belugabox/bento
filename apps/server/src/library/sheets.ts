import { and, eq } from 'drizzle-orm';

import type { Db } from '../db';
import { sourceSheets } from '../db/schema';
import type { MetadataSource } from '../metadata/sourceLink';

/** Ce qu'une fiche (Manga-news, Bedetheque) donne et qu'on surveille. */
export type WatchedSheet = {
    title: string;
    ongoing?: boolean;
    volumeCount?: number;
    writer: string;
    penciller: string;
    publisher: string;
    summary: string;
};

type Snapshot = Record<string, string | number | boolean | null>;

/** Valeurs surveillées d'une fiche, sous le nom affiché du champ. */
export const snapshotOf = (sheet: WatchedSheet): Snapshot => ({
    Titre: sheet.title,
    Statut: sheet.ongoing ?? null,
    Tomes: sheet.volumeCount ?? null,
    Scénario: sheet.writer,
    Dessin: sheet.penciller,
    Éditeur: sheet.publisher,
    // Espaces et sauts de ligne de la page : sans importance.
    Résumé: sheet.summary.replace(/\s+/g, ' ').trim(),
});

const statusText = (value: Snapshot[string] | undefined) =>
    value === true ? 'en cours' : value === false ? 'terminée' : 'inconnu';

/**
 * Champs changés entre deux lectures (« Tomes : 12 → 13 », « Résumé ») ; un
 * champ absent de l'ancienne lecture n'est pas compté.
 */
export const sheetChanges = (before: Snapshot, after: Snapshot) =>
    Object.keys(after).flatMap((field) => {
        if (!(field in before) || before[field] === after[field]) return [];
        if (field === 'Tomes') {
            return [`Tomes : ${before[field] ?? '?'} → ${after[field] ?? '?'}`];
        }
        if (field === 'Statut') {
            return [
                `Statut : ${statusText(before[field])} → ${statusText(after[field])}`,
            ];
        }
        return [field];
    });

/** Fiche disparue du site (« Revoir » propose d'en choisir une autre). */
export const SHEET_GONE = 'Fiche introuvable';

const findSheet = (db: Db, site: MetadataSource, sourceId: string) =>
    db
        .select()
        .from(sourceSheets)
        .where(
            and(
                eq(sourceSheets.site, site),
                eq(sourceSheets.sourceId, sourceId),
            ),
        )
        .get();

const saveSheet = (
    db: Db,
    site: MetadataSource,
    sourceId: string,
    values: { snapshot: Snapshot; changes: string[] | null },
) => {
    const row = { ...values, checkedAt: new Date() };
    db.insert(sourceSheets)
        .values({ site, sourceId, ...row })
        .onConflictDoUpdate({
            target: [sourceSheets.site, sourceSheets.sourceId],
            set: row,
        })
        .run();
};

/**
 * Fiche lue par l'admin (recherche, « Remplir », « Mettre à jour ») : ses
 * valeurs deviennent la référence, plus rien à revoir.
 */
export const sheetSeen = (
    db: Db,
    site: MetadataSource,
    sourceId: string,
    sheet: WatchedSheet,
) =>
    saveSheet(db, site, sourceId, {
        snapshot: snapshotOf(sheet),
        changes: null,
    });

/**
 * Fiche relue en arrière-plan : ce qui a changé depuis que l'admin l'a vue
 * (sans référence, cette lecture le devient). Rien n'est appliqué à la
 * série ; `undefined` : fiche disparue du site.
 */
export const sheetChecked = (
    db: Db,
    site: MetadataSource,
    sourceId: string,
    sheet: WatchedSheet | undefined,
) => {
    const known = findSheet(db, site, sourceId);
    if (!sheet) {
        saveSheet(db, site, sourceId, {
            snapshot: known?.snapshot ?? {},
            changes: [SHEET_GONE],
        });
        return;
    }
    // Sans référence (ou fiche disparue dès la 1re lecture) : celle-ci.
    const snapshot =
        known && Object.keys(known.snapshot).length > 0
            ? known.snapshot
            : snapshotOf(sheet);
    const changes = sheetChanges(snapshot, snapshotOf(sheet));
    saveSheet(db, site, sourceId, {
        snapshot,
        changes: changes.length > 0 ? changes : null,
    });
};

/** Toutes les fiches lues, par « site:id » (date et changements). */
export const sourceSheetsMap = (db: Db) =>
    new Map(
        db
            .select({
                site: sourceSheets.site,
                sourceId: sourceSheets.sourceId,
                checkedAt: sourceSheets.checkedAt,
                changes: sourceSheets.changes,
            })
            .from(sourceSheets)
            .all()
            .map((row) => [`${row.site}:${row.sourceId}`, row]),
    );
