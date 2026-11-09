import { and, eq, sql } from 'drizzle-orm';

import type { Db } from '../db';
import { series } from '../db/schema';
import { notFound } from '../tools/errors';
import { type Viewer, visibleTo } from './visibility';

export type SeriesReader = {
    id: number;
    name: string;
    avatarSeed: string | null;
    /** Part des pages de la série lues, de 0 à 100. */
    percent: number;
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
    return rows
        .map(({ readPages, totalPages, ...user }) => ({
            ...user,
            percent: totalPages
                ? Math.min(100, Math.floor((readPages * 100) / totalPages))
                : 0,
        }))
        .filter((reader) => reader.percent >= minPercent)
        .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
};
