import { and, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';

import { genreKey } from '../classification';
import type { Db } from '../db';
import { libraries, series, sheetProposals, sheetSearches } from '../db/schema';
import { nameVariant, sameSeriesName } from '../metadata/seriesNames';
import {
    type MetadataSource,
    parseSources,
    sourcesText,
} from '../metadata/sourceLink';
import { notFound } from '../tools/errors';
import { articleFirst } from './sortName';

/** Sites où une fiche manquante est cherchée (ceux qui ont une note). */
export const SEARCHED_SITES = ['manga-news', 'bedetheque'] as const;
export type SearchedSite = (typeof SEARCHED_SITES)[number];

// Rien trouvé : la série est cherchée de nouveau après 90 jours.
export const SEARCH_AGAIN_AFTER_MS = 90 * 24 * 3600_000;
// Fiches au même nom gardées pour une série (homonymes, éditions).
const MAX_CANDIDATES = 3;

/** Une recherche à faire : la série, le site, et l'écriture du nom. */
export type SheetSearch = {
    seriesId: number;
    site: SearchedSite;
    name: string;
    text: string;
};

/** Ce qu'une fiche proposée dit, pour juger (et « même auteur »). */
export type ProposalDetails = {
    writer: string | null;
    penciller: string | null;
    publisher: string | null;
    volumeCount: number | null;
    year: number | null;
    sameAuthor: boolean | null;
};

export type SheetProposal = {
    site: SearchedSite;
    id: string;
    title: string;
    details: ProposalDetails;
};

const key = (seriesId: number, site: string) => `${seriesId}:${site}`;

/** Séries, leur nom à chercher et les sites où chercher. */
const seriesToSearch = (db: Db, disabled: readonly MetadataSource[]) =>
    db
        .select({
            id: series.id,
            name: series.name,
            sources: series.sources,
            type: libraries.type,
        })
        .from(series)
        .innerJoin(libraries, eq(libraries.id, series.libraryId))
        .all()
        .flatMap((row) => {
            const linked = parseSources(row.sources).map((l) => l.site);
            return SEARCHED_SITES.filter(
                (site) =>
                    !disabled.includes(site) &&
                    !linked.includes(site) &&
                    // Manga-news : des mangas seulement.
                    (site !== 'manga-news' || row.type === 'manga'),
            ).map((site) => ({
                seriesId: row.id,
                site,
                name: articleFirst(row.name),
            }));
        });

/**
 * Recherches à faire : les séries sans fiche d'un site, une écriture du nom
 * à la fois (« et », puis « & »). Une série qui a déjà une fiche à vérifier
 * ou proposée n'est pas cherchée ; sans résultat, elle l'est de nouveau
 * après 90 jours ou si son nom change.
 */
export const searchesToDo = (
    db: Db,
    now: number,
    disabled: readonly MetadataSource[],
): SheetSearch[] => {
    const done = new Map(
        db
            .select()
            .from(sheetSearches)
            .all()
            .map((row) => [key(row.seriesId, row.site), row]),
    );
    const waiting = new Set(
        db
            .select({
                seriesId: sheetProposals.seriesId,
                site: sheetProposals.site,
            })
            .from(sheetProposals)
            .where(ne(sheetProposals.status, 'refused'))
            .all()
            .map((row) => key(row.seriesId, row.site)),
    );
    return seriesToSearch(db, disabled).flatMap((item) => {
        if (waiting.has(key(item.seriesId, item.site))) return [];
        const last = done.get(key(item.seriesId, item.site));
        const tried =
            last &&
            last.name === item.name &&
            now - last.searchedAt.getTime() < SEARCH_AGAIN_AFTER_MS
                ? last.tried
                : [];
        const text = [item.name, nameVariant(item.name)].find(
            (t): t is string => !!t && !tried.includes(t),
        );
        return text ? [{ ...item, text }] : [];
    });
};

/**
 * Résultat d'une recherche : les fiches au même nom (à l'écriture près)
 * sont gardées pour être vérifiées ; une fiche refusée ne revient pas.
 */
export const recordSearch = (
    db: Db,
    search: SheetSearch,
    results: { id: string; title: string }[],
    now = new Date(),
) => {
    const exact = results
        .filter((r) => sameSeriesName(r.title, search.name))
        .slice(0, MAX_CANDIDATES);
    for (const result of exact) {
        db.insert(sheetProposals)
            .values({
                seriesId: search.seriesId,
                site: search.site,
                sourceId: result.id,
                title: result.title,
                status: 'pending',
                createdAt: now,
            })
            .onConflictDoNothing()
            .run();
    }
    const last = db
        .select()
        .from(sheetSearches)
        .where(
            and(
                eq(sheetSearches.seriesId, search.seriesId),
                eq(sheetSearches.site, search.site),
            ),
        )
        .get();
    const before = last?.name === search.name ? last.tried : [];
    // Trouvée : plus d'autre écriture à essayer.
    const tried = exact.length
        ? [search.name, nameVariant(search.name) ?? search.name]
        : [...new Set([...before, search.text])];
    const values = { name: search.name, tried, searchedAt: now };
    db.insert(sheetSearches)
        .values({ seriesId: search.seriesId, site: search.site, ...values })
        .onConflictDoUpdate({
            target: [sheetSearches.seriesId, sheetSearches.site],
            set: values,
        })
        .run();
    return exact.length;
};

/** Fiches trouvées, à lire pour être proposées (sites actifs, sans fiche liée). */
export const pendingProposals = (
    db: Db,
    disabled: readonly MetadataSource[],
) => {
    const linked = new Map(
        db
            .select({ id: series.id, sources: series.sources })
            .from(series)
            .where(isNotNull(series.sources))
            .all()
            .map((row) => [
                row.id,
                parseSources(row.sources).map((l) => l.site),
            ]),
    );
    return db
        .select({
            seriesId: sheetProposals.seriesId,
            site: sheetProposals.site,
            sourceId: sheetProposals.sourceId,
        })
        .from(sheetProposals)
        .where(eq(sheetProposals.status, 'pending'))
        .orderBy(sheetProposals.createdAt)
        .all()
        .filter(
            (p) =>
                !disabled.includes(p.site as MetadataSource) &&
                !(linked.get(p.seriesId) ?? []).includes(
                    p.site as MetadataSource,
                ),
        )
        .map((p) => ({ ...p, site: p.site as SearchedSite }));
};

/** Une personne, quel que soit l'ordre prénom-nom ou la casse. */
const personKey = (name: string) =>
    genreKey(name).split(' ').filter(Boolean).sort().join(' ');
const persons = (...names: (string | null | undefined)[]) =>
    names
        .flatMap((value) => (value ?? '').split(','))
        .map(personKey)
        .filter(Boolean);

/** Scénario et dessin connus de la série (première valeur remplie). */
const seriesCredits = (db: Db, seriesId: number) => {
    const row = db.get<{ writer: string | null; penciller: string | null }>(
        sql`select series.writer as writer, (select json_extract(v.comic_info, '$.Penciller') from volumes v where v.series_id = series.id and coalesce(json_extract(v.comic_info, '$.Penciller'), '') != '' limit 1) as penciller from series where series.id = ${seriesId}`,
    );
    return persons(row?.writer, row?.penciller);
};

/**
 * Fiche lue : proposée, avec ce qu'elle dit (et si un auteur est commun
 * avec la série) ; disparue du site : oubliée.
 */
export const verifyProposal = (
    db: Db,
    proposal: { seriesId: number; site: SearchedSite; sourceId: string },
    sheet:
        | {
              writer: string;
              penciller: string;
              publisher: string;
              volumeCount?: number;
              year?: number;
              firstYear?: number;
          }
        | undefined,
) => {
    const where = and(
        eq(sheetProposals.seriesId, proposal.seriesId),
        eq(sheetProposals.site, proposal.site),
        eq(sheetProposals.sourceId, proposal.sourceId),
    );
    if (!sheet) {
        db.delete(sheetProposals).where(where).run();
        return;
    }
    const known = seriesCredits(db, proposal.seriesId);
    const theirs = persons(sheet.writer, sheet.penciller);
    const details: ProposalDetails = {
        writer: sheet.writer || null,
        penciller: sheet.penciller || null,
        publisher: sheet.publisher || null,
        volumeCount: sheet.volumeCount ?? null,
        year: sheet.year ?? sheet.firstYear ?? null,
        sameAuthor:
            known.length && theirs.length
                ? theirs.some((p) => known.includes(p))
                : null,
    };
    db.update(sheetProposals)
        .set({ status: 'proposed', details })
        .where(where)
        .run();
};

/** Fiches proposées, par série (sites sans fiche liée seulement). */
export const proposalsBySeries = (db: Db) => {
    const map = new Map<number, SheetProposal[]>();
    for (const row of db
        .select()
        .from(sheetProposals)
        .where(eq(sheetProposals.status, 'proposed'))
        .orderBy(sheetProposals.site, sheetProposals.title)
        .all()) {
        map.set(row.seriesId, [
            ...(map.get(row.seriesId) ?? []),
            {
                site: row.site as SearchedSite,
                id: row.sourceId,
                title: row.title,
                details: row.details as ProposalDetails,
            },
        ]);
    }
    return map;
};

/**
 * Réponse de l'admin : « Lier » ajoute la fiche à la série (les autres
 * propositions du site sont oubliées) ; « Ce n'est pas elle » la refuse
 * pour de bon.
 */
export const answerProposal = (
    db: Db,
    seriesId: number,
    site: SearchedSite,
    sourceId: string,
    accept: boolean,
) => {
    const where = and(
        eq(sheetProposals.seriesId, seriesId),
        eq(sheetProposals.site, site),
        eq(sheetProposals.sourceId, sourceId),
    );
    const proposal = db.select().from(sheetProposals).where(where).get();
    if (!proposal) throw notFound('Fiche proposée introuvable');
    if (!accept) {
        db.update(sheetProposals).set({ status: 'refused' }).where(where).run();
        return;
    }
    const current = db
        .select({ sources: series.sources })
        .from(series)
        .where(eq(series.id, seriesId))
        .get();
    db.update(series)
        .set({
            sources: sourcesText([
                ...parseSources(current?.sources),
                { site, id: sourceId },
            ]),
        })
        .where(eq(series.id, seriesId))
        .run();
    db.delete(sheetProposals)
        .where(
            and(
                eq(sheetProposals.seriesId, seriesId),
                eq(sheetProposals.site, site),
                inArray(sheetProposals.status, ['pending', 'proposed']),
            ),
        )
        .run();
};
