import { and, eq, inArray, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
    access,
    copyFile,
    mkdir,
    readdir,
    rename,
    rmdir,
    stat,
    unlink,
} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { type PageReader, openArchive, pageEntries } from '../archive/archive';
import {
    convertCbrToCbz,
    isCbr,
    isRarArchive,
    repairRarCbz,
} from '../archive/cbr';
import { type ComicInfo, readComicInfo } from '../archive/comicInfo';
import { updateComicInfo } from '../archive/write';
import type { Db } from '../db';
import { libraries, series, volumes } from '../db/schema';
import { conflict, notFound } from '../tools/errors';
import type { Logger } from '../tools/logger';
import {
    DRAFT_FOLDER,
    isDraft,
    publicationPathOf,
    relativeTo,
    resolveInLibrary,
    volumeNumberOf,
} from './paths';
import type { LibraryScanner } from './scanner';

/** Un CBZ de la bibliothèque (brouillon ou publié), pour la gestion. */
export type FileInfo = {
    // Relatif à la bibliothèque, séparé par « / ».
    path: string;
    name: string;
    folder: string;
    size: number;
    draft: boolean;
    pageCount: number;
    comicInfo: ComicInfo;
    // Archive illisible ou .cbr non convertible.
    error: string | null;
    // Emplacement d'après le ComicInfo ; null sans série ou sans numéro.
    publicationPath: string | null;
};

export type ComicInfoChanges = {
    [K in keyof ComicInfo]?: ComicInfo[K] | null;
};

type Failure = { path: string; reason: string };

const COVER_WIDTH = 400;

const exists = (fullPath: string) =>
    access(fullPath).then(
        () => true,
        () => false,
    );

/** Même fichier (casse près, sur un disque insensible à la casse) ? */
const isSameFile = async (first: string, second: string) => {
    if (first === second) return true;
    const [a, b] = await Promise.all([
        stat(first).catch(() => undefined),
        stat(second).catch(() => undefined),
    ]);
    return !!a && !!b && a.dev === b.dev && a.ino === b.ino;
};

/** Déplace un fichier ; copie puis supprime s'il change de disque. */
const moveFile = async (from: string, to: string) => {
    try {
        await rename(from, to);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
        await copyFile(from, to);
        await unlink(from);
    }
};

const reasonOf = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

/**
 * Gestion des CBZ d'une bibliothèque : brouillons (`_draft`) et tomes
 * publiés. Lecture des infos, modification du ComicInfo, rangement.
 */
export class LibraryFiles {
    // Infos lues dans les archives, par chemin absolu (taille + date).
    private cache = new Map<
        string,
        {
            key: string;
            info: Pick<FileInfo, 'pageCount' | 'comicInfo' | 'error'>;
        }
    >();
    // .cbr dont la conversion a échoué : pas retentée tant qu'il ne change pas.
    private conversionErrors = new Map<
        string,
        { key: string; reason: string }
    >();

    constructor(
        private readonly db: Db,
        private readonly scanner: LibraryScanner,
        private readonly reader: PageReader,
        private readonly coversPath: string,
        private readonly logger: Logger,
    ) {}

    private library = (libraryId: number) => {
        const library = this.db
            .select()
            .from(libraries)
            .where(eq(libraries.id, libraryId))
            .get();
        if (!library) throw notFound('Bibliothèque introuvable');
        return library;
    };

    /** Couverture d'un fichier (brouillon surtout), en cache disque. */
    coverPath = (fullPath: string) =>
        path.join(
            this.coversPath,
            'files',
            `${createHash('sha1').update(fullPath).digest('hex')}.webp`,
        );

    /** Infos lues dans l'archive, recalculées quand le fichier change. */
    private read = async (fullPath: string) => {
        const stats = await stat(fullPath).catch(() => {
            throw notFound(`« ${path.basename(fullPath)} » n'existe plus`);
        });
        const key = `${stats.size}:${stats.mtimeMs}`;
        const cached = this.cache.get(fullPath);
        if (cached?.key === key) return { ...cached.info, size: stats.size };

        let info: Pick<FileInfo, 'pageCount' | 'comicInfo' | 'error'>;
        try {
            const zip = await openArchive(fullPath);
            const pages = pageEntries(zip);
            info = {
                pageCount: pages.length,
                comicInfo: await readComicInfo(zip.getEntries()),
                error:
                    pages.length === 0 ? 'aucune image dans l’archive' : null,
            };
            if (pages[0]) {
                const cover = this.coverPath(fullPath);
                await mkdir(path.dirname(cover), { recursive: true });
                await sharp(pages[0].getData())
                    .resize({ width: COVER_WIDTH, withoutEnlargement: true })
                    .webp({ quality: 80 })
                    .toFile(cover)
                    .catch(() => undefined);
            }
        } catch (error) {
            info = { pageCount: 0, comicInfo: {}, error: reasonOf(error) };
        }
        // Une archive illisible est réessayée à chaque lecture.
        if (!info.error) this.cache.set(fullPath, { key, info });
        return { ...info, size: stats.size };
    };

    private infoOf = async (
        libraryPath: string,
        fullPath: string,
    ): Promise<FileInfo> => {
        const relative = relativeTo(libraryPath, fullPath);
        const conversion = this.conversionErrors.get(fullPath);
        const base = {
            path: relative,
            name: path.basename(relative),
            folder: path.posix.dirname(relative),
            draft: isDraft(relative),
        };
        if (conversion) {
            const { size } = await stat(fullPath);
            return {
                ...base,
                size,
                pageCount: 0,
                comicInfo: {},
                error: `Conversion en CBZ impossible : ${conversion.reason}`,
                publicationPath: null,
            };
        }
        const info = await this.read(fullPath);
        return {
            ...base,
            ...info,
            publicationPath: info.error
                ? null
                : (publicationPathOf(info.comicInfo) ?? null),
        };
    };

    info = (libraryId: number, relative: string) => {
        const library = this.library(libraryId);
        return this.infoOf(
            library.path,
            resolveInLibrary(library.path, relative),
        );
    };

    /** Chemin absolu d'un fichier de la bibliothèque (lecture, couverture). */
    fullPath = (libraryId: number, relative: string) =>
        resolveInLibrary(this.library(libraryId).path, relative);

    /**
     * Convertit en CBZ les .cbr des brouillons, et réécrit en ZIP les .cbz
     * qui sont en réalité des archives RAR.
     */
    private convertDrafts = async (draftRoot: string) => {
        const entries = await readdir(draftRoot, {
            withFileTypes: true,
            recursive: true,
        }).catch(() => []);
        for (const entry of entries) {
            const extension = path.extname(entry.name).toLowerCase();
            if (
                !entry.isFile() ||
                (extension !== '.cbz' && !isCbr(entry.name))
            ) {
                continue;
            }
            const fullPath = path.join(entry.parentPath, entry.name);
            const stats = await stat(fullPath).catch(() => undefined);
            if (!stats) continue;
            const key = `${stats.size}:${stats.mtimeMs}`;
            if (this.conversionErrors.get(fullPath)?.key === key) continue;
            if (this.cache.get(fullPath)?.key === key) continue;
            try {
                if (isCbr(entry.name)) {
                    await convertCbrToCbz(fullPath);
                    this.logger.info(`Brouillon ${entry.name} converti en CBZ`);
                } else if (await isRarArchive(fullPath)) {
                    await repairRarCbz(fullPath);
                    this.logger.info(
                        `Brouillon ${entry.name} (RAR) réécrit en ZIP`,
                    );
                }
                this.conversionErrors.delete(fullPath);
            } catch (error) {
                this.conversionErrors.set(fullPath, {
                    key,
                    reason: reasonOf(error),
                });
            }
        }
    };

    /**
     * Séries en attente dans les brouillons de toutes les bibliothèques :
     * dossiers contenant des archives (un tome à la racine de _draft compte
     * pour une série). Sans ouvrir les archives : appelé souvent.
     */
    pendingSeries = async () => {
        let count = 0;
        for (const library of this.db.select().from(libraries).all()) {
            const draftRoot = path.join(library.path, DRAFT_FOLDER);
            const entries = await readdir(draftRoot, {
                withFileTypes: true,
                recursive: true,
            }).catch(() => []);
            const folders = new Set<string>();
            for (const entry of entries) {
                const extension = path.extname(entry.name).toLowerCase();
                if (
                    !entry.isFile() ||
                    (extension !== '.cbz' && extension !== '.cbr')
                ) {
                    continue;
                }
                const atRoot =
                    path.resolve(entry.parentPath) === path.resolve(draftRoot);
                folders.add(
                    atRoot
                        ? path.join(entry.parentPath, entry.name)
                        : entry.parentPath,
                );
            }
            count += folders.size;
        }
        return count;
    };

    /** Archives (.cbz, .cbr) sous un dossier, triées par chemin. */
    private archivesUnder = async (libraryPath: string, dir: string) => {
        const entries = await readdir(dir, {
            withFileTypes: true,
            recursive: true,
        }).catch(() => []);
        const archives: { fullPath: string; path: string; folder: string }[] =
            [];
        for (const entry of entries) {
            const extension = path.extname(entry.name).toLowerCase();
            if (
                !entry.isFile() ||
                (extension !== '.cbz' && !isCbr(entry.name))
            ) {
                continue;
            }
            const fullPath = path.join(entry.parentPath, entry.name);
            const relative = relativeTo(libraryPath, fullPath);
            archives.push({
                fullPath,
                path: relative,
                folder: path.posix.dirname(relative),
            });
        }
        return archives.sort((a, b) =>
            a.path.localeCompare(b.path, undefined, { numeric: true }),
        );
    };

    /**
     * Dossiers de brouillons et leurs fichiers (nom, taille), sans ouvrir
     * les archives : rapide, même avec des centaines de tomes.
     */
    drafts = async (libraryId: number) => {
        const library = this.library(libraryId);
        const archives = await this.archivesUnder(
            library.path,
            path.join(library.path, DRAFT_FOLDER),
        );
        const folders = new Map<
            string,
            { path: string; name: string; size: number }[]
        >();
        for (const archive of archives) {
            const { size } = await stat(archive.fullPath).catch(() => ({
                size: 0,
            }));
            folders.set(archive.folder, [
                ...(folders.get(archive.folder) ?? []),
                { path: archive.path, name: path.basename(archive.path), size },
            ]);
        }
        return [...folders].map(([folder, files]) => ({ folder, files }));
    };

    /**
     * Fichiers d'un dossier de brouillons, avec leur ComicInfo : les
     * archives de ce seul dossier sont lues (et les .cbr convertis).
     */
    draftFolder = async (libraryId: number, requested: string) => {
        const library = this.library(libraryId);
        // Chemin résolu dans _draft (« _draft/../Gantz » n'en est pas un).
        const draftRoot = path.resolve(library.path, DRAFT_FOLDER);
        const dir = path.resolve(library.path, ...requested.split('/'));
        if (dir !== draftRoot && !dir.startsWith(draftRoot + path.sep)) {
            throw notFound('Dossier de brouillons introuvable');
        }
        const folder = relativeTo(library.path, dir);
        await this.convertDrafts(dir);
        const files: FileInfo[] = [];
        for (const archive of await this.archivesUnder(library.path, dir)) {
            // Un .cbr reste listé tant que sa conversion échoue.
            if (archive.folder !== folder) continue;
            if (
                isCbr(archive.path) &&
                !this.conversionErrors.has(archive.fullPath)
            ) {
                continue;
            }
            files.push(await this.infoOf(library.path, archive.fullPath));
        }
        return files;
    };

    /**
     * Modifie le ComicInfo de plusieurs fichiers. Un échec n'empêche pas les
     * suivants ; la bibliothèque est rescannée si des tomes publiés changent.
     */
    updateComicInfo = async (
        libraryId: number,
        updates: { path: string; changes: ComicInfoChanges }[],
    ) => {
        const library = this.library(libraryId);
        const updated: FileInfo[] = [];
        const failures: Failure[] = [];
        for (const update of updates) {
            try {
                const fullPath = resolveInLibrary(library.path, update.path);
                await updateComicInfo(fullPath, update.changes);
                updated.push(await this.infoOf(library.path, fullPath));
            } catch (error) {
                failures.push({ path: update.path, reason: reasonOf(error) });
            }
        }
        if (updated.some((file) => !file.draft)) {
            await this.scanner.scan(libraryId);
        }
        return { updated, failures };
    };

    /**
     * Range des fichiers à leur emplacement (`Série/Série #NN (Année).cbz`).
     * Un brouillon remplace le tome publié du même numéro ; un tome publié
     * déplacé n'écrase jamais un autre tome. Le tome indexé garde son
     * identifiant (et donc la progression de lecture de chacun).
     */
    publish = async (libraryId: number, paths: string[]) => {
        const library = this.library(libraryId);
        const published: { from: string; to: string }[] = [];
        const failures: Failure[] = [];
        const folders = new Set<string>();
        // Statut des séries des tomes publiés déplacés, à reporter ensuite.
        const statuses = new Map(
            this.db
                .select({ file: volumes.file, status: series.status })
                .from(volumes)
                .innerJoin(series, eq(series.id, volumes.seriesId))
                .where(
                    and(
                        eq(volumes.libraryId, libraryId),
                        inArray(volumes.file, paths),
                    ),
                )
                .all()
                .filter((row) => row.status)
                .map((row) => [row.file, row.status]),
        );

        for (const relative of paths) {
            try {
                const to = await this.publishOne(
                    library.path,
                    libraryId,
                    relative,
                );
                if (to) {
                    published.push({ from: relative, to });
                    folders.add(path.posix.dirname(to));
                }
            } catch (error) {
                failures.push({ path: relative, reason: reasonOf(error) });
            }
        }
        // Après tous les tomes : les chemins reçus restent valides pendant la boucle.
        for (const folder of folders) {
            await this.fixFolderCase(library.path, folder).catch((error) =>
                this.logger.warn(
                    `Casse du dossier ${folder} : ${reasonOf(error)}`,
                ),
            );
        }
        if (published.length > 0) await this.scanner.scan(libraryId);
        for (const { from, to } of published) {
            const status = statuses.get(from);
            if (!status) continue;
            const moved = this.db
                .select({ seriesId: volumes.seriesId })
                .from(volumes)
                .where(
                    and(eq(volumes.libraryId, libraryId), eq(volumes.file, to)),
                )
                .get();
            if (moved) {
                this.db
                    .update(series)
                    .set({ status })
                    .where(
                        and(
                            eq(series.id, moved.seriesId),
                            isNull(series.status),
                        ),
                    )
                    .run();
            }
        }
        return { published, failures };
    };

    private publishOne = async (
        libraryPath: string,
        libraryId: number,
        relative: string,
    ): Promise<string | undefined> => {
        const sourcePath = resolveInLibrary(libraryPath, relative);
        const info = await this.infoOf(libraryPath, sourcePath);
        if (info.error) throw new Error(info.error);
        if (!info.publicationPath) {
            throw new Error('il faut au moins la série et le numéro du tome');
        }
        if (info.publicationPath === relative) return undefined;

        // Dérivé du champ `Series` (non fiable) : confiné dans la bibliothèque.
        const destPath = resolveInLibrary(libraryPath, info.publicationPath);
        const destDir = path.dirname(destPath);
        // Changement de casse seulement, sur un disque insensible à la casse.
        const sameFile = await isSameFile(sourcePath, destPath);

        // Tomes rangés du même numéro sous un autre nom (« #12 » et « #12 (2024) »).
        const number = volumeNumberOf(path.basename(info.publicationPath));
        const sameNumber: string[] = [];
        if (number) {
            const entries = await readdir(destDir, {
                withFileTypes: true,
            }).catch(() => []);
            for (const entry of entries) {
                if (
                    !entry.isFile() ||
                    path.extname(entry.name).toLowerCase() !== '.cbz' ||
                    volumeNumberOf(entry.name) !== number
                ) {
                    continue;
                }
                const candidate = path.join(destDir, entry.name);
                if (await isSameFile(candidate, sourcePath)) continue;
                sameNumber.push(candidate);
            }
        }

        if (!info.draft) {
            const taken =
                (!sameFile && (await exists(destPath))
                    ? destPath
                    : undefined) ?? sameNumber[0];
            if (taken) {
                throw conflict(
                    `le tome ${number ?? ''} existe déjà : ${path.basename(taken)}`,
                );
            }
        }

        // Tome indexé qui sera remplacé (brouillon) ou déplacé (publié) :
        // il garde son identifiant sous son nouveau chemin. Parmi les tomes
        // du même numéro, celui qui porte déjà le nom visé passe en premier.
        const replacedFirst = [
            ...sameNumber.filter(
                (p) => p.toLowerCase() === destPath.toLowerCase(),
            ),
            ...sameNumber.filter(
                (p) => p.toLowerCase() !== destPath.toLowerCase(),
            ),
        ];
        const kept = info.draft
            ? replacedFirst[0] && relativeTo(libraryPath, replacedFirst[0])
            : relative;

        await mkdir(destDir, { recursive: true });
        if (sameFile) {
            const tmpPath = `${sourcePath}.moving`;
            await rename(sourcePath, tmpPath);
            await rename(tmpPath, destPath);
        } else {
            for (const replaced of sameNumber) await unlink(replaced);
            await moveFile(sourcePath, destPath);
        }
        if (kept) {
            // Un autre tome indexé sous le chemin visé est périmé.
            if (kept !== info.publicationPath) {
                this.db
                    .delete(volumes)
                    .where(
                        and(
                            eq(volumes.libraryId, libraryId),
                            eq(volumes.file, info.publicationPath),
                        ),
                    )
                    .run();
            }
            this.db
                .update(volumes)
                // Date impossible : le prochain scan relit le tome.
                .set({ file: info.publicationPath, mtimeMs: -1 })
                .where(
                    and(
                        eq(volumes.libraryId, libraryId),
                        eq(volumes.file, kept),
                    ),
                )
                .run();
        }
        this.cache.delete(sourcePath);
        this.logger.info(`Rangé : ${relative} → ${info.publicationPath}`);

        // Supprimer l'ancien dossier s'il est vide (jamais la racine ni _draft).
        const sourceDir = path.dirname(sourcePath);
        const keep = [
            path.resolve(libraryPath),
            path.resolve(libraryPath, DRAFT_FOLDER),
        ];
        if (!keep.includes(path.resolve(sourceDir))) {
            if ((await readdir(sourceDir).catch(() => ['?'])).length === 0) {
                await rmdir(sourceDir).catch(() => undefined);
            }
        }
        return info.publicationPath;
    };

    /**
     * Sur un disque insensible à la casse, un dossier « Spy X Family » garde
     * sa casse quand on y range « Spy x Family/… » : le renommer.
     */
    private fixFolderCase = async (libraryPath: string, folder: string) => {
        const fullDir = resolveInLibrary(libraryPath, folder);
        const parent = path.dirname(fullDir);
        const wanted = path.basename(fullDir);
        const entries = await readdir(parent);
        const actual = entries.find(
            (e) => e !== wanted && e.toLowerCase() === wanted.toLowerCase(),
        );
        // Si les deux existent, le disque distingue la casse : rien à faire.
        if (!actual || entries.includes(wanted)) return;
        const tmpDir = path.join(parent, `${wanted}.moving`);
        await rename(path.join(parent, actual), tmpDir);
        await rename(tmpDir, fullDir);
    };

    /** Page d'un fichier (aperçu d'un brouillon). */
    page = (libraryId: number, relative: string, index: number) =>
        this.reader.page(this.fullPath(libraryId, relative), index);
}
