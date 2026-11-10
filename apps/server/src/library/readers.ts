import { and, eq, sql } from 'drizzle-orm';

import type { Db } from '../db';
import { series } from '../db/schema';
import { notFound } from '../tools/errors';
import { type Viewer, visibleTo } from './visibility';
import type { VolumeKind } from './volumeKind';

export type SeriesReader = {
    id: number;
    name: string;
    avatarSeed: string | null;
    /** Part des pages de la série lues, de 0 à 100. */
    percent: number;
    /** Dernier tome ouvert dans la série : où en est la personne. */
    current: {
        number: string | null;
        title: string | null;
        kind: VolumeKind;
        /** Page atteinte, à partir de 1. */
        page: number;
        pageCount: number;
        completed: boolean;
    } | null;
};

/**
 * Les autres comptes qui ont lu au moins `minPercent` % des pages de la
 * série (tome terminé : toutes ses pages ; commencé : jusqu'à la page
 * atteinte), les plus avancés d'abord.
 */
export const seriesReaders = (
    db: Db,
    viewer: Viewer,
    seriesId: number,
    minPercent: number,
): SeriesReader[] => {
    const visible = db
        .select({ id: series.id })
        .from(series)
        .where(and(eq(series.id, seriesId), visibleTo(viewer)))
        .get();
    if (!visible) throw notFound('Série introuvable');

    const rows = db.all<{
        id: number;
        name: string;
        avatarSeed: string | null;
        readPages: number;
        totalPages: number;
    }>(sql`
        select users.id as id, users.name as name,
            users.avatar_seed as avatarSeed,
            sum(case when read_progress.completed then volumes.page_count
                else min(read_progress.page + 1, volumes.page_count) end)
                as readPages,
            (select sum(v.page_count) from volumes v
                where v.series_id = ${seriesId}) as totalPages
        from read_progress
        join volumes on volumes.id = read_progress.volume_id
        join users on users.id = read_progress.user_id
        where volumes.series_id = ${seriesId} and users.id != ${viewer.id}
        group by users.id
    `);
    // Dernier tome ouvert par chacun (le plus récent d'abord).
    const latest = new Map<number, SeriesReader['current']>();
    for (const row of db.all<{
        userId: number;
        number: string | null;
        title: string | null;
        kind: VolumeKind;
        page: number;
        pageCount: number;
        completed: number;
    }>(sql`
        select read_progress.user_id as userId, volumes.number as number,
            volumes.title as title, volumes.kind as kind,
            read_progress.page as page, volumes.page_count as pageCount,
            read_progress.completed as completed
        from read_progress
        join volumes on volumes.id = read_progress.volume_id
        where volumes.series_id = ${seriesId}
        -- Même instant (deux tomes enregistrés ensemble) : le plus loin.
        order by read_progress.updated_at desc, volumes.sort_number desc,
            volumes.id desc
    `)) {
        if (latest.has(row.userId)) continue;
        latest.set(row.userId, {
            number: row.number,
            title: row.title,
            kind: row.kind,
            page: Math.min(row.page + 1, row.pageCount),
            pageCount: row.pageCount,
            completed: Boolean(row.completed),
        });
    }

    return rows
        .map(({ readPages, totalPages, ...user }) => ({
            ...user,
            current: latest.get(user.id) ?? null,
            percent: totalPages
                ? Math.min(100, Math.floor((readPages * 100) / totalPages))
                : 0,
        }))
        .filter((reader) => reader.percent >= minPercent)
        .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
};

export type FamilyReader = {
    id: number;
    name: string;
    avatarSeed: string | null;
    /** Séries visibles dont la personne a lu au moins le seuil. */
    seriesIds: number[];
};

/**
 * Pour le filtre « Lu par » de l'accueil : les autres comptes, chacun avec
 * les séries (visibles pour `viewer`) dont il a lu au moins `minPercent` %
 * des pages ; seulement ceux qui en ont, par nom.
 */
export const familyReaders = (
    db: Db,
    viewer: Viewer,
    minPercent: number,
): FamilyReader[] => {
    const visible = new Set(
        db
            .select({ id: series.id })
            .from(series)
            .where(visibleTo(viewer))
            .all()
            .map((s) => s.id),
    );
    const rows = db.all<{
        id: number;
        name: string;
        avatarSeed: string | null;
        seriesId: number;
        readPages: number;
        totalPages: number;
    }>(sql`
        select users.id as id, users.name as name,
            users.avatar_seed as avatarSeed, v.series_id as seriesId,
            sum(case when rp.completed then v.page_count
                else min(rp.page + 1, v.page_count) end) as readPages,
            (select sum(t.page_count) from volumes t
                where t.series_id = v.series_id) as totalPages
        from read_progress rp
        join volumes v on v.id = rp.volume_id
        join users on users.id = rp.user_id
        where users.id != ${viewer.id}
        group by users.id, v.series_id
    `);
    const byUser = new Map<number, FamilyReader>();
    for (const row of rows) {
        if (!visible.has(row.seriesId) || !row.totalPages) continue;
        if ((row.readPages * 100) / row.totalPages < minPercent) continue;
        const reader = byUser.get(row.id) ?? {
            id: row.id,
            name: row.name,
            avatarSeed: row.avatarSeed,
            seriesIds: [],
        };
        reader.seriesIds.push(row.seriesId);
        byUser.set(row.id, reader);
    }
    return [...byUser.values()].sort((a, b) =>
        a.name.localeCompare(b.name, 'fr'),
    );
};
