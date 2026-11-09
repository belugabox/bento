import Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Db } from '../db';
import {
    readProgress,
    readingSessions,
    seriesLists,
    users,
    volumes,
} from '../db/schema';
import { AGE_RATINGS, isAgeRating } from '../library/ageRating';
import { badRequest } from '../tools/errors';

/**
 * Migration depuis Kavita : sa base (kavita.db, avec -wal et -shm) est
 * envoyée par l'admin, analysée, puis reprise dans Bento : comptes,
 * progression, liste « à lire », dates d'ajout et temps de lecture.
 *
 * Les tomes sont reliés par leur chemin dans la bibliothèque : Kavita et
 * Bento lisent les mêmes fichiers.
 */

export const KAVITA_FILES = [
    'kavita.db',
    'kavita.db-wal',
    'kavita.db-shm',
] as const;

/** Classifications de Kavita (son énumération `AgeRating`), en ComicInfo. */
const KAVITA_AGE_RATINGS: Record<number, string> = {
    2: 'Early Childhood',
    3: 'Everyone',
    4: 'G',
    5: 'Everyone 10+',
    6: 'PG',
    7: 'Kids to Adults',
    8: 'Teen',
    9: 'MA15+',
    10: 'Mature 17+',
    11: 'M',
    12: 'R18+',
    13: 'Adults Only 18+',
    14: 'X18+',
};

/** Âge maximal d'un compte Kavita ; null : sans limite. */
const ageOf = (restriction: number | null) => {
    const rating = KAVITA_AGE_RATINGS[restriction ?? -1];
    return rating && isAgeRating(rating) ? AGE_RATINGS[rating] : null;
};

/** Date de Kavita (« 2026-03-30 17:03:01.8958383 », en UTC). */
const kavitaDate = (value: string | null) => {
    if (!value) return undefined;
    const time = Date.parse(`${value.replace(' ', 'T').slice(0, 23)}Z`);
    return Number.isNaN(time) ? undefined : new Date(time);
};

/** Séance reconstituée par Kavita : minuit pile, sans vraie mesure. */
const isEstimated = (start: string) => / 00:00:00$/.test(start);

/** Nom comparé sans casse ni accents. */
const nameKey = (name: string) =>
    name.normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase('fr');

const fileKey = (file: string) => file.replace(/\\/g, '/').normalize('NFC');

type KavitaAccount = {
    id: number;
    name: string;
    ageRestriction: number | null;
};

type KavitaProgress = {
    userId: number;
    filePath: string;
    libraryId: number;
    pagesRead: number;
    pages: number;
    modified: string | null;
};

type KavitaFile = {
    filePath: string;
    libraryId: number;
    seriesId: number;
    fileCreated: string | null;
    chapterCreated: string | null;
};

type KavitaSession = {
    id: number;
    userId: number;
    start: string;
    end: string | null;
};

type KavitaActivity = {
    sessionId: number;
    filePath: string | null;
    libraryId: number | null;
    pagesRead: number;
};

export type AccountChoice =
    | { kavitaId: number; action: 'link'; userId: number }
    | {
          kavitaId: number;
          action: 'create';
          name: string;
          maxAge: number | null;
      }
    | { kavitaId: number; action: 'skip' };

export type ApplyOptions = {
    accounts: AccountChoice[];
    addedDates: boolean;
    readingTime: boolean;
    estimatedSessions: boolean;
};

const hoursOf = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;

export class KavitaImport {
    constructor(
        private readonly db: Db,
        private readonly dir: string,
    ) {}

    /** Les fichiers envoyés remplacent les précédents. */
    save = async (files: { name: string; data: Uint8Array }[]) => {
        const names = files.map((f) => f.name);
        if (!names.includes('kavita.db')) {
            throw badRequest('Il faut au moins le fichier kavita.db');
        }
        const unknown = names.filter(
            (n) => !(KAVITA_FILES as readonly string[]).includes(n),
        );
        if (unknown.length > 0) {
            throw badRequest(
                `Fichiers attendus : ${KAVITA_FILES.join(', ')} (reçu : ${unknown.join(', ')})`,
            );
        }
        await this.clear();
        await mkdir(this.dir, { recursive: true });
        for (const file of files) {
            await writeFile(path.join(this.dir, file.name), file.data);
        }
    };

    clear = () => rm(this.dir, { recursive: true, force: true });

    hasFiles = async () => {
        const present = await readdir(this.dir).catch(() => [] as string[]);
        return present.includes('kavita.db');
    };

    /** Lit la base de Kavita (copie de l'admin : on peut y écrire). */
    private read = () => {
        let kavita: Database.Database;
        try {
            kavita = new Database(path.join(this.dir, 'kavita.db'), {
                fileMustExist: true,
            });
            kavita.prepare('select count(*) from AspNetUsers').get();
        } catch {
            throw badRequest('Ce fichier n’est pas une base de Kavita lisible');
        }
        try {
            // Bibliothèques de mangas et BD, sauf celles rangées dans une
            // autre (le dossier _draft) : leur chemin relatif serait faux.
            const folders = kavita
                .prepare(
                    `select l.Id as libraryId, f.Path as path from Library l
                     join FolderPath f on f.LibraryId = l.Id where l.Type != 2`,
                )
                .all() as { libraryId: number; path: string }[];
            const roots = new Map<number, string>();
            for (const folder of folders) {
                const root = folder.path.replace(/\/+$/, '');
                const nested = folders.some(
                    (other) =>
                        other !== folder &&
                        root.startsWith(`${other.path.replace(/\/+$/, '')}/`),
                );
                if (!nested) roots.set(folder.libraryId, root);
            }
            const accounts = kavita
                .prepare(
                    `select Id as id, UserName as name,
                        AgeRestriction as ageRestriction
                     from AspNetUsers order by Id`,
                )
                .all() as KavitaAccount[];
            const progress = kavita
                .prepare(
                    `select p.AppUserId as userId, m.FilePath as filePath,
                        s.LibraryId as libraryId, p.PagesRead as pagesRead,
                        c.Pages as pages, p.LastModifiedUtc as modified
                     from AppUserProgresses p
                     join Chapter c on c.Id = p.ChapterId
                     join MangaFile m on m.ChapterId = p.ChapterId
                     join Series s on s.Id = p.SeriesId`,
                )
                .all() as KavitaProgress[];
            const files = kavita
                .prepare(
                    `select m.FilePath as filePath, s.LibraryId as libraryId,
                        s.Id as seriesId, m.CreatedUtc as fileCreated,
                        c.CreatedUtc as chapterCreated
                     from MangaFile m
                     join Chapter c on c.Id = m.ChapterId
                     join Volume v on v.Id = c.VolumeId
                     join Series s on s.Id = v.SeriesId`,
                )
                .all() as KavitaFile[];
            const wantToRead = kavita
                .prepare(
                    `select AppUserId as userId, SeriesId as seriesId
                     from AppUserWantToRead`,
                )
                .all() as { userId: number; seriesId: number }[];
            const sessions = kavita
                .prepare(
                    `select Id as id, AppUserId as userId,
                        StartTimeUtc as start, EndTimeUtc as end
                     from AppUserReadingSession`,
                )
                .all() as KavitaSession[];
            const activities = kavita
                .prepare(
                    `select a.AppUserReadingSessionId as sessionId,
                        m.FilePath as filePath, a.LibraryId as libraryId,
                        a.PagesRead as pagesRead
                     from AppUserReadingSessionActivityData a
                     left join MangaFile m on m.ChapterId = a.ChapterId`,
                )
                .all() as KavitaActivity[];
            return {
                roots,
                accounts,
                progress,
                files,
                wantToRead,
                sessions,
                activities,
            };
        } catch {
            throw badRequest(
                'Base de Kavita incomplète ou d’une autre version',
            );
        } finally {
            kavita.close();
        }
    };

    /** Tomes de Bento par chemin relatif dans leur bibliothèque. */
    private bentoVolumes = () => {
        const map = new Map<
            string,
            { id: number; seriesId: number; pageCount: number; addedAt: Date }
        >();
        for (const volume of this.db
            .select({
                id: volumes.id,
                seriesId: volumes.seriesId,
                file: volumes.file,
                pageCount: volumes.pageCount,
                addedAt: volumes.addedAt,
            })
            .from(volumes)
            .all()) {
            const key = fileKey(volume.file);
            if (!map.has(key)) map.set(key, volume);
        }
        return map;
    };

    /** Lecture complète, avec chaque fichier de Kavita relié à son tome. */
    private load = () => {
        const data = this.read();
        const bento = this.bentoVolumes();
        const relative = (
            filePath: string | null,
            libraryId: number | null,
        ) => {
            const root =
                libraryId === null ? undefined : data.roots.get(libraryId);
            if (!filePath || !root || !filePath.startsWith(`${root}/`)) {
                return undefined;
            }
            return fileKey(filePath.slice(root.length + 1));
        };
        const volumeOf = (
            filePath: string | null,
            libraryId: number | null,
        ) => {
            const key = relative(filePath, libraryId);
            return key === undefined ? undefined : bento.get(key);
        };
        return { ...data, relative, volumeOf };
    };

    /** Ce que la migration reprendrait, avant de choisir. */
    analyze = () => {
        const data = this.load();
        const bentoAccounts = this.db
            .select({
                id: users.id,
                name: users.name,
                username: users.username,
            })
            .from(users)
            .all();

        const files = data.files.filter(
            (f) => data.relative(f.filePath, f.libraryId) !== undefined,
        );
        const unmatchedFiles = files
            .filter((f) => !data.volumeOf(f.filePath, f.libraryId))
            .map((f) => data.relative(f.filePath, f.libraryId)!);
        let olderDates = 0;
        for (const file of files) {
            const volume = data.volumeOf(file.filePath, file.libraryId);
            const date = this.addedDateOf(file);
            if (volume && date && date < volume.addedAt) olderDates++;
        }

        const accounts = data.accounts.map((account) => {
            const progress = data.progress.filter(
                (p) => p.userId === account.id && p.pagesRead > 0,
            );
            const matched = progress.filter((p) =>
                data.volumeOf(p.filePath, p.libraryId),
            );
            const sessions = data.sessions.filter(
                (s) => s.userId === account.id && s.end,
            );
            const duration = (list: KavitaSession[]) =>
                hoursOf(
                    list.reduce(
                        (sum, s) =>
                            sum +
                            Math.max(
                                0,
                                (kavitaDate(s.end)?.getTime() ?? 0) -
                                    (kavitaDate(s.start)?.getTime() ?? 0),
                            ),
                        0,
                    ),
                );
            const estimated = sessions.filter((s) => isEstimated(s.start));
            const measured = sessions.filter((s) => !isEstimated(s.start));
            const key = nameKey(account.name);
            const same = bentoAccounts.find(
                (u) =>
                    nameKey(u.name) === key ||
                    (u.username !== null && nameKey(u.username) === key),
            );
            return {
                kavitaId: account.id,
                name: account.name,
                maxAge: ageOf(account.ageRestriction),
                completed: progress.filter((p) => p.pagesRead >= p.pages)
                    .length,
                inProgress: progress.filter((p) => p.pagesRead < p.pages)
                    .length,
                matched: matched.length,
                wantToRead: data.wantToRead.filter(
                    (w) => w.userId === account.id,
                ).length,
                sessions: {
                    measured: measured.length,
                    measuredHours: duration(measured),
                    estimated: estimated.length,
                    estimatedHours: duration(estimated),
                },
                // Compte Bento du même nom, sinon création « à activer ».
                suggestedUserId: same?.id ?? null,
            };
        });

        return {
            accounts,
            files: {
                total: files.length,
                matched: files.length - unmatchedFiles.length,
                unmatched: unmatchedFiles.slice(0, 50),
            },
            olderDates,
        };
    };

    private addedDateOf = (file: KavitaFile) => {
        const dates = [
            kavitaDate(file.fileCreated),
            kavitaDate(file.chapterCreated),
        ]
            .filter((d): d is Date => d !== undefined)
            .map((d) => d.getTime());
        return dates.length ? new Date(Math.min(...dates)) : undefined;
    };

    /** Reprend dans Bento ce que l'admin a choisi. Relançable sans doublon. */
    apply = (options: ApplyOptions) => {
        const data = this.load();
        const report = {
            accountsCreated: 0,
            progress: 0,
            progressKept: 0,
            toRead: 0,
            addedDates: 0,
            sessions: 0,
        };

        this.db.transaction((tx) => {
            // Comptes : Kavita → Bento.
            const target = new Map<number, number>();
            for (const choice of options.accounts) {
                if (!data.accounts.some((a) => a.id === choice.kavitaId)) {
                    throw badRequest('Compte Kavita inconnu');
                }
                if (choice.action === 'link') {
                    const user = tx
                        .select({ id: users.id })
                        .from(users)
                        .where(eq(users.id, choice.userId))
                        .get();
                    if (!user) throw badRequest('Compte Bento introuvable');
                    target.set(choice.kavitaId, user.id);
                } else if (choice.action === 'create') {
                    const name = choice.name.trim();
                    if (!name) throw badRequest('Nom du compte à créer vide');
                    // Sans identifiant ni mot de passe : « à activer ».
                    const { id } = tx
                        .insert(users)
                        .values({ name, role: 'reader', maxAge: choice.maxAge })
                        .returning({ id: users.id })
                        .get();
                    target.set(choice.kavitaId, id);
                    report.accountsCreated++;
                }
            }

            // Progression : la plus récente gagne.
            for (const p of data.progress) {
                const userId = target.get(p.userId);
                const volume = data.volumeOf(p.filePath, p.libraryId);
                const updatedAt = kavitaDate(p.modified);
                if (!userId || !volume || p.pagesRead <= 0 || !updatedAt) {
                    continue;
                }
                const existing = tx
                    .select({ updatedAt: readProgress.updatedAt })
                    .from(readProgress)
                    .where(
                        and(
                            eq(readProgress.userId, userId),
                            eq(readProgress.volumeId, volume.id),
                        ),
                    )
                    .get();
                if (existing && existing.updatedAt >= updatedAt) {
                    report.progressKept++;
                    continue;
                }
                const completed =
                    p.pagesRead >= p.pages || p.pagesRead >= volume.pageCount;
                const values = {
                    page: completed
                        ? volume.pageCount - 1
                        : Math.min(p.pagesRead - 1, volume.pageCount - 1),
                    completed,
                    updatedAt,
                };
                tx.insert(readProgress)
                    .values({ userId, volumeId: volume.id, ...values })
                    .onConflictDoUpdate({
                        target: [readProgress.userId, readProgress.volumeId],
                        set: values,
                    })
                    .run();
                report.progress++;
            }

            // « Want to read » → « À lire » (série reliée par ses fichiers).
            for (const w of data.wantToRead) {
                const userId = target.get(w.userId);
                const file = data.files.find((f) => f.seriesId === w.seriesId);
                const volume =
                    file && data.volumeOf(file.filePath, file.libraryId);
                if (!userId || !volume) continue;
                const inserted = tx
                    .insert(seriesLists)
                    .values({
                        userId,
                        seriesId: volume.seriesId,
                        list: 'toread',
                    })
                    .onConflictDoNothing()
                    .run();
                report.toRead += inserted.changes;
            }

            // Dates d'ajout : la plus ancienne des deux.
            if (options.addedDates) {
                for (const file of data.files) {
                    const volume = data.volumeOf(file.filePath, file.libraryId);
                    const date = this.addedDateOf(file);
                    if (!volume || !date || date >= volume.addedAt) continue;
                    tx.update(volumes)
                        .set({ addedAt: date })
                        .where(eq(volumes.id, volume.id))
                        .run();
                    report.addedDates++;
                }
            }

            // Temps de lecture : une séance Kavita = une séance Bento, liée
            // au tome où l'on a lu le plus de pages.
            if (options.readingTime) {
                for (const session of data.sessions) {
                    const userId = target.get(session.userId);
                    const startedAt = kavitaDate(session.start);
                    const endedAt = kavitaDate(session.end);
                    if (!userId || !startedAt || !endedAt) continue;
                    if (endedAt < startedAt) continue;
                    if (
                        isEstimated(session.start) &&
                        !options.estimatedSessions
                    ) {
                        continue;
                    }
                    const acts = data.activities.filter(
                        (a) => a.sessionId === session.id,
                    );
                    const main = [...acts].sort(
                        (a, b) => b.pagesRead - a.pagesRead,
                    )[0];
                    const volume =
                        main && data.volumeOf(main.filePath, main.libraryId);
                    const inserted = tx
                        .insert(readingSessions)
                        .values({
                            userId,
                            volumeId: volume?.id ?? null,
                            startedAt,
                            endedAt,
                            pages: acts.reduce(
                                (sum, a) => sum + a.pagesRead,
                                0,
                            ),
                            source: 'kavita',
                            externalId: `kavita:${session.id}`,
                        })
                        .onConflictDoNothing()
                        .run();
                    report.sessions += inserted.changes;
                }
            }
        });
        return report;
    };
}
