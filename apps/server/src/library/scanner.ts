import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import {
    type ArchiveEntry,
    pageEntries,
    readArchive,
} from '../archive/archive';
import { readComicInfo } from '../archive/comicInfo';
import { parseVolumeFileName } from '../archive/fileName';
import { readImage } from '../archive/image';
import type { Db } from '../db';
import { libraries, series, volumes } from '../db/schema';
import { TaskList } from '../tasks';
import type { Logger } from '../tools/logger';
import { seriesAge } from './ageRating';
import { smallCoverFile } from './smallCovers';

export type ScanResult = {
    added: number;
    updated: number;
    removed: number;
    errors: { file: string; reason: string }[];
};

type FoundArchive = {
    // Relatif à la bibliothèque, séparé par « / ».
    file: string;
    fullPath: string;
    size: number;
    mtimeMs: number;
};

// Format d'une couverture (2:3), recadrée depuis le haut : une page très
// haute (webtoon) ne donne pas une vignette interminable.
const COVER_SIZE = {
    width: 400,
    height: 600,
    fit: 'cover',
    position: 'top',
} as const;

export const coverFile = (coversPath: string, volumeId: number) =>
    path.join(coversPath, `${volumeId}.webp`);

/**
 * Archives .cbz de la bibliothèque. Les dossiers commençant par « _ »
 * (brouillons) ou « . » (cachés) sont ignorés.
 */
export const findArchives = async (root: string): Promise<FoundArchive[]> => {
    const entries = await readdir(root, {
        withFileTypes: true,
        recursive: true,
    });
    const found: FoundArchive[] = [];
    for (const entry of entries) {
        if (
            !entry.isFile() ||
            path.extname(entry.name).toLowerCase() !== '.cbz'
        ) {
            continue;
        }
        const fullPath = path.join(entry.parentPath, entry.name);
        const file = path.relative(root, fullPath).split(path.sep).join('/');
        if (file.split('/').some((part) => /^[_.]/.test(part))) continue;
        const stats = await stat(fullPath).catch(() => undefined);
        if (!stats) continue;
        found.push({
            file,
            fullPath,
            size: stats.size,
            mtimeMs: stats.mtimeMs,
        });
    }
    return found;
};

const stem = (file: string) => path.basename(file, path.extname(file));

/**
 * Série d'un tome : son dossier de premier niveau. Un tome rangé à la
 * racine forme sa propre série, d'après son ComicInfo ou son nom.
 */
export const seriesKeyOf = (file: string, seriesName?: string) => {
    const [first, ...rest] = file.split('/');
    if (rest.length > 0) return first!;
    return seriesName ?? parseVolumeFileName(stem(file)).series ?? stem(file);
};

const toSortNumber = (number?: string) => {
    const value = number === undefined ? NaN : Number.parseFloat(number);
    return Number.isNaN(value) ? null : value;
};

export class LibraryScanner {
    // Un seul scan à la fois par bibliothèque : les appels suivants l'attendent.
    private running = new Map<number, Promise<ScanResult>>();

    constructor(
        private readonly db: Db,
        private readonly coversPath: string,
        private readonly logger: Logger,
        // Tâches de fond, partagées avec l'API (icône des tâches).
        readonly tasks = new TaskList(),
    ) {}

    isScanning = (libraryId: number) => this.running.has(libraryId);

    scan = (libraryId: number): Promise<ScanResult> => {
        const current = this.running.get(libraryId);
        if (current) return current;
        const run = this.doScan(libraryId).finally(() =>
            this.running.delete(libraryId),
        );
        this.running.set(libraryId, run);
        return run;
    };

    private doScan = async (libraryId: number): Promise<ScanResult> => {
        const library = this.db
            .select()
            .from(libraries)
            .where(eq(libraries.id, libraryId))
            .get();
        if (!library) throw new Error(`Bibliothèque ${libraryId} inconnue`);

        const task = this.tasks.start(`Scan de « ${library.name} »`);
        try {
            return await this.scanLibrary(library, task);
        } finally {
            task.finish();
        }
    };

    private scanLibrary = async (
        library: typeof libraries.$inferSelect,
        task: ReturnType<TaskList['start']>,
    ): Promise<ScanResult> => {
        const libraryId = library.id;
        const started = Date.now();
        const result: ScanResult = {
            added: 0,
            updated: 0,
            removed: 0,
            errors: [],
        };
        await mkdir(this.coversPath, { recursive: true });

        const found = await findArchives(library.path);
        const known = new Map(
            this.db
                .select({
                    id: volumes.id,
                    file: volumes.file,
                    size: volumes.size,
                    mtimeMs: volumes.mtimeMs,
                })
                .from(volumes)
                .where(eq(volumes.libraryId, libraryId))
                .all()
                .map((v) => [v.file, v]),
        );

        const kept: string[] = [];
        for (const [index, archive] of found.entries()) {
            task.progress(index, found.length);
            const previous = known.get(archive.file);
            if (
                previous &&
                previous.size === archive.size &&
                previous.mtimeMs === archive.mtimeMs
            ) {
                kept.push(archive.file);
                // Couverture ratée lors d'un scan précédent : la refaire.
                const cover = coverFile(this.coversPath, previous.id);
                if (!(await stat(cover).catch(() => undefined))) {
                    await this.writeCover(previous.id, archive);
                }
                continue;
            }
            try {
                await this.index(libraryId, archive);
                kept.push(archive.file);
                if (previous) result.updated++;
                else result.added++;
            } catch (error) {
                const reason =
                    error instanceof Error ? error.message : String(error);
                result.errors.push({ file: archive.file, reason });
                this.logger.warn(`Scan : ${archive.file} ignoré (${reason})`);
            }
        }

        result.removed = await this.removeMissing(libraryId, kept);
        this.refreshSeries(libraryId);
        this.db
            .update(libraries)
            .set({ lastScanAt: new Date() })
            .where(eq(libraries.id, libraryId))
            .run();

        this.logger.info(
            `Scan de « ${library.name} » en ${Date.now() - started} ms : ` +
                `${result.added} ajouté(s), ${result.updated} mis à jour, ` +
                `${result.removed} retiré(s), ${result.errors.length} erreur(s)`,
        );
        return result;
    };

    /** Lit une archive et l'enregistre (série comprise), avec sa couverture. */
    private index = async (libraryId: number, archive: FoundArchive) => {
        const entries = await readArchive(archive.fullPath);
        const pages = pageEntries(entries);
        if (pages.length === 0) throw new Error('aucune image dans l’archive');
        const comicInfo = await readComicInfo(entries);
        const fromName = parseVolumeFileName(stem(archive.file));

        const key = seriesKeyOf(archive.file, comicInfo.Series);
        const seriesRow = this.db
            .insert(series)
            .values({ libraryId, key, name: comicInfo.Series ?? key })
            .onConflictDoUpdate({
                target: [series.libraryId, series.key],
                set: { updatedAt: new Date() },
            })
            .returning({ id: series.id })
            .get();

        const number = comicInfo.Number ?? fromName.number;
        const values = {
            libraryId,
            seriesId: seriesRow.id,
            file: archive.file,
            number: number ?? null,
            sortNumber: toSortNumber(number),
            title: comicInfo.Title ?? null,
            comicInfo,
            pageCount: pages.length,
            // Fichier nouveau ou modifié : dimensions à recalculer.
            pageSizes: null,
            size: archive.size,
            mtimeMs: archive.mtimeMs,
        };
        const volume = this.db
            .insert(volumes)
            .values(values)
            .onConflictDoUpdate({
                target: [volumes.libraryId, volumes.file],
                set: values,
            })
            .returning({ id: volumes.id })
            .get();

        // Couverture : sans elle, le tome reste lisible.
        await this.writeCover(volume.id, archive, pages[0]);
    };

    /** Couverture d'un tome, d'après sa première page ; un échec est noté. */
    private writeCover = async (
        volumeId: number,
        archive: FoundArchive,
        firstPage?: ArchiveEntry,
    ) => {
        try {
            const page =
                firstPage ??
                pageEntries(await readArchive(archive.fullPath))[0];
            if (!page) throw new Error('aucune image dans l’archive');
            await readImage(await page.getData())
                .resize(COVER_SIZE)
                .webp({ quality: 80 })
                .toFile(coverFile(this.coversPath, volumeId));
        } catch (error) {
            this.logger.warn(
                `Scan : couverture de ${archive.file} impossible (${String(error)})`,
            );
        }
    };

    /** Retire les tomes disparus (et leurs couvertures) ; renvoie leur nombre. */
    private removeMissing = async (libraryId: number, kept: string[]) => {
        const gone = this.db
            .select({ id: volumes.id })
            .from(volumes)
            .where(
                and(
                    eq(volumes.libraryId, libraryId),
                    kept.length > 0
                        ? notInArray(volumes.file, kept)
                        : undefined,
                ),
            )
            .all()
            .map((v) => v.id);
        if (gone.length === 0) return 0;
        this.db.delete(volumes).where(inArray(volumes.id, gone)).run();
        await Promise.all(
            gone.flatMap((id) => [
                rm(coverFile(this.coversPath, id), { force: true }),
                rm(smallCoverFile(coverFile(this.coversPath, id)), {
                    force: true,
                }),
            ]),
        );
        return gone.length;
    };

    /**
     * Supprime les séries vides et recopie dans chaque série les
     * métadonnées de son premier tome ; la classification est la plus
     * restrictive de ses tomes.
     */
    private refreshSeries = (libraryId: number) => {
        this.db
            .delete(series)
            .where(
                and(
                    eq(series.libraryId, libraryId),
                    // SQL brut : Drizzle ne préfixerait pas les colonnes par leur table.
                    sql`not exists (select 1 from volumes where volumes.series_id = series.id)`,
                ),
            )
            .run();

        const rows = this.db
            .select({
                id: series.id,
                key: series.key,
            })
            .from(series)
            .where(eq(series.libraryId, libraryId))
            .all();
        for (const row of rows) {
            const infos = this.db
                .select({ comicInfo: volumes.comicInfo })
                .from(volumes)
                .where(eq(volumes.seriesId, row.id))
                .orderBy(
                    sql`${volumes.sortNumber} is null`,
                    asc(volumes.sortNumber),
                    asc(volumes.file),
                )
                .all()
                .map((v) => v.comicInfo);
            const info = infos[0] ?? {};
            this.db
                .update(series)
                .set({
                    name: info.Series ?? row.key,
                    summary: info.Summary ?? null,
                    genre: info.Genre ?? null,
                    ...seriesAge(infos.map((i) => i.AgeRating)),
                    year: info.Year ?? null,
                    count: info.Count ?? null,
                    writer: info.Writer ?? null,
                    publisher: info.Publisher ?? null,
                })
                .where(eq(series.id, row.id))
                .run();
        }
    };
}
