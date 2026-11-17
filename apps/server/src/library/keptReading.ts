import { and, inArray, isNull } from 'drizzle-orm';

import type { Db } from '../db';
import { readProgress, readingSessions } from '../db/schema';
import { listsSnapshot, restoreLists } from './lists';

/**
 * Ce qu'une série remise en brouillon garde de côté, rendu à la
 * publication : progression de chacun et séances de lecture de chaque tome
 * (par son chemin dans `_draft`), listes « à lire » de la série. Sans quoi
 * le scan, ne trouvant plus les fichiers, effacerait les lectures.
 */
export type KeptReading = {
    lists: ReturnType<typeof listsSnapshot>['lists'];
    volumes: Record<
        string,
        {
            progress: {
                userId: number;
                page: number;
                completed: boolean;
                updatedAt: number;
            }[];
            // Séances (leur tome devient null en attendant).
            sessions: number[];
        }
    >;
};

/** Lectures d'une série, chaque tome rangé sous son futur chemin. */
export const keepReading = (
    db: Db,
    seriesId: number,
    volumes: { id: number; draftPath: string }[],
): KeptReading => {
    const ids = volumes.map((v) => v.id);
    const progress = ids.length
        ? db
              .select()
              .from(readProgress)
              .where(inArray(readProgress.volumeId, ids))
              .all()
        : [];
    const sessions = ids.length
        ? db
              .select({
                  id: readingSessions.id,
                  volumeId: readingSessions.volumeId,
              })
              .from(readingSessions)
              .where(inArray(readingSessions.volumeId, ids))
              .all()
        : [];
    return {
        lists: listsSnapshot(db, seriesId).lists,
        volumes: Object.fromEntries(
            volumes.map((volume) => [
                volume.draftPath,
                {
                    progress: progress
                        .filter((p) => p.volumeId === volume.id)
                        .map((p) => ({
                            userId: p.userId,
                            page: p.page,
                            completed: p.completed,
                            updatedAt: p.updatedAt.getTime(),
                        })),
                    sessions: sessions
                        .filter((s) => s.volumeId === volume.id)
                        .map((s) => s.id),
                },
            ]),
        ),
    };
};

export const parseKept = (text: string | null | undefined) => {
    if (!text) return undefined;
    try {
        return JSON.parse(text) as KeptReading;
    } catch {
        return undefined;
    }
};

/** Lectures d'un tome publié depuis `draftPath`, rendues à son tome. */
export const restoreVolumeReading = (
    db: Db,
    kept: KeptReading,
    draftPath: string,
    volumeId: number,
) => {
    const volume = kept.volumes[draftPath];
    if (!volume) return;
    for (const p of volume.progress) {
        db.insert(readProgress)
            .values({
                userId: p.userId,
                volumeId,
                page: p.page,
                completed: p.completed,
                updatedAt: new Date(p.updatedAt),
            })
            // Lu entre-temps (impossible en principe) : gardé tel quel.
            .onConflictDoNothing()
            .run();
    }
    if (volume.sessions.length) {
        db.update(readingSessions)
            .set({ volumeId })
            .where(
                and(
                    inArray(readingSessions.id, volume.sessions),
                    isNull(readingSessions.volumeId),
                ),
            )
            .run();
    }
};

/** Listes « à lire » rendues à la série publiée. */
export const restoreKeptLists = (db: Db, kept: KeptReading, seriesId: number) =>
    restoreLists(db, seriesId, { lists: kept.lists });
