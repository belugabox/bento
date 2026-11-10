import { and, desc, eq } from 'drizzle-orm';

import type { Db } from '../db';
import { readingSessions } from '../db/schema';

// Envoi suivant dans ce délai : même séance, prolongée.
const SAME_SESSION_MS = 10 * 60 * 1000;

/**
 * Ajoute du temps passé dans le lecteur sur un tome (envoyé par morceaux
 * pendant la lecture). Seul le temps actif compte : une séance récente du
 * même tome est prolongée de ce temps, sinon une nouvelle commence.
 */
export const addReadingTime = (
    db: Db,
    userId: number,
    volumeId: number,
    { seconds, pages }: { seconds: number; pages: number },
    now = new Date(),
) => {
    const last = db
        .select({
            id: readingSessions.id,
            endedAt: readingSessions.endedAt,
            pages: readingSessions.pages,
        })
        .from(readingSessions)
        .where(
            and(
                eq(readingSessions.userId, userId),
                eq(readingSessions.volumeId, volumeId),
                eq(readingSessions.source, 'bento'),
            ),
        )
        .orderBy(desc(readingSessions.endedAt))
        .limit(1)
        .get();
    // Envoi plus ancien que la dernière séance (lecture hors ligne) : une
    // séance à part.
    const gap = last ? now.getTime() - last.endedAt.getTime() : -1;
    if (last && gap >= 0 && gap <= SAME_SESSION_MS) {
        db.update(readingSessions)
            .set({
                endedAt: new Date(last.endedAt.getTime() + seconds * 1000),
                pages: last.pages + pages,
            })
            .where(eq(readingSessions.id, last.id))
            .run();
        return;
    }
    db.insert(readingSessions)
        .values({
            userId,
            volumeId,
            startedAt: new Date(now.getTime() - seconds * 1000),
            endedAt: now,
            pages,
            source: 'bento',
        })
        .run();
};
