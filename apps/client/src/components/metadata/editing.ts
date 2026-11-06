import {
    type ComicInfo,
    type GenreEntry,
    classify,
    parseVolumeFileName,
} from '@server/types';

/** Champs communs à toute la série, appliqués à chaque tome. */
export const SERIES_FIELDS = [
    'Series',
    'Genre',
    'Tags',
    'Writer',
    'Penciller',
    'Publisher',
    'AgeRating',
] as const;

export type SeriesField = (typeof SERIES_FIELDS)[number];

/** ComicInfo de chaque tome en cours d'édition, par chemin de fichier. */
export type Edits = Record<string, ComicInfo>;

/** Un tome à éditer : son fichier et son ComicInfo actuel. */
export type EditableVolume = {
    path: string;
    name: string;
    comicInfo: ComicInfo;
};

export const initialEdits = (volumes: EditableVolume[]): Edits =>
    Object.fromEntries(volumes.map((v) => [v.path, { ...v.comicInfo }]));

const isEmpty = (value: unknown) =>
    value === undefined || value === null || value === '';

/** Valeur d'un champ de série : celle du premier tome qui en a une. */
export const seriesValue = <F extends SeriesField>(
    edits: Edits,
    paths: string[],
    field: F,
): ComicInfo[F] | undefined =>
    paths.map((p) => edits[p]?.[field]).find((value) => !isEmpty(value));

/** Les tomes n'ont pas tous la même valeur pour ce champ. */
export const isMixed = (edits: Edits, paths: string[], field: SeriesField) =>
    new Set(paths.map((p) => edits[p]?.[field] ?? '')).size > 1;

const setField = <F extends keyof ComicInfo>(
    info: ComicInfo,
    field: F,
    value: ComicInfo[F] | undefined,
): ComicInfo => {
    const next = { ...info };
    if (isEmpty(value)) delete next[field];
    else next[field] = value;
    return next;
};

/** Applique un champ à tous les tomes. */
export const setSeriesField = <F extends SeriesField>(
    edits: Edits,
    field: F,
    value: ComicInfo[F] | undefined,
): Edits =>
    Object.fromEntries(
        Object.entries(edits).map(([path, info]) => [
            path,
            setField(info, field, value),
        ]),
    );

/**
 * Rattache les tomes à une série publiée : son nom et ses champs de série
 * (ceux de son premier tome), à la place de ceux saisis.
 */
export const joinSeries = (
    edits: Edits,
    name: string,
    source: ComicInfo,
): Edits =>
    SERIES_FIELDS.reduce(
        (next, field) =>
            field === 'Series'
                ? setSeriesField(next, field, name)
                : isEmpty(source[field])
                  ? next
                  : setSeriesField(next, field, source[field] as never),
        edits,
    );

/** Modifie un champ d'un seul tome. */
export const setVolumeField = <F extends keyof ComicInfo>(
    edits: Edits,
    path: string,
    field: F,
    value: ComicInfo[F] | undefined,
): Edits => ({ ...edits, [path]: setField(edits[path] ?? {}, field, value) });

/** Le champ peut être rempli : vide, ou remplacement demandé. */
const fillable = (current: unknown, overwrite: boolean) =>
    overwrite || isEmpty(current);

/**
 * Numéro, année (et série si vide) lus dans les noms de fichiers. Sans
 * `overwrite`, seuls les champs vides sont remplis.
 */
export const fillFromFileNames = (
    edits: Edits,
    volumes: EditableVolume[],
    overwrite: boolean,
): Edits => {
    let next = edits;
    for (const volume of volumes) {
        const parsed = parseVolumeFileName(
            volume.name.replace(/\.cb[zr]$/i, ''),
        );
        const info = next[volume.path] ?? {};
        if (parsed.number && fillable(info.Number, overwrite)) {
            next = setVolumeField(next, volume.path, 'Number', parsed.number);
        }
        // Titre par défaut : « Tome N ».
        const number = parsed.number ?? info.Number;
        if (number && fillable(info.Title, overwrite)) {
            next = setVolumeField(next, volume.path, 'Title', `Tome ${number}`);
        }
        if (parsed.year && fillable(info.Year, overwrite)) {
            next = setVolumeField(next, volume.path, 'Year', parsed.year);
        }
        // La série du nom de fichier ne remplace jamais une série saisie.
        if (parsed.series && isEmpty(info.Series)) {
            next = setVolumeField(next, volume.path, 'Series', parsed.series);
        }
    }
    return next;
};

/** Fiche Wikipédia, telle que renvoyée par le serveur. */
export type WikipediaSeries = {
    title: string;
    summary: string;
    genre: string;
    writer: string;
    penciller: string;
    publisher: string;
    ongoing: boolean;
    lastYear?: number;
};

export type SeriesStatus = 'ongoing' | 'completed';

/** Statut d'après Wikipédia : terminée avec une année de fin, sinon en cours. */
export const statusFromWikipedia = (
    wiki: Pick<WikipediaSeries, 'ongoing' | 'lastYear'>,
): SeriesStatus | undefined =>
    wiki.lastYear ? 'completed' : wiki.ongoing ? 'ongoing' : undefined;

/** Fiche Manga-news, telle que renvoyée par le serveur. */
export type MangaNewsSeries = {
    title: string;
    summary: string;
    genres: string[];
    themes: string[];
    writer: string;
    penciller: string;
    publisher: string;
    /** Nom du format (« Manga »). */
    format: string | null;
    age?: number;
    ageRating?: string;
    ongoing?: boolean;
};

/**
 * Fiche d'une série trouvée en ligne, quelle que soit sa source : ce qui
 * remplit l'éditeur.
 */
export type SeriesSheet = {
    title: string;
    summary?: string;
    genre?: string;
    tags?: string;
    writer?: string;
    penciller?: string;
    publisher?: string;
    ageRating?: string;
    status?: SeriesStatus;
    /** Nom du format, à rapprocher de ceux des réglages. */
    format?: string;
    /** Âge conseillé (« 12+ » : 12). */
    age?: number;
};

export const sheetFromWikipedia = (wiki: WikipediaSeries): SeriesSheet => ({
    title: wiki.title,
    summary: wiki.summary,
    genre: wiki.genre,
    writer: wiki.writer,
    penciller: wiki.penciller,
    publisher: wiki.publisher,
    status: statusFromWikipedia(wiki),
});

export const sheetFromMangaNews = (series: MangaNewsSeries): SeriesSheet => ({
    title: series.title,
    summary: series.summary,
    genre: series.genres.join(', '),
    tags: series.themes.join(', '),
    writer: series.writer,
    penciller: series.penciller,
    publisher: series.publisher,
    ageRating: series.ageRating,
    status:
        series.ongoing === undefined
            ? undefined
            : series.ongoing
              ? 'ongoing'
              : 'completed',
    format: series.format ?? undefined,
    age: series.age,
});

/**
 * Genres et thèmes après remplissage, rangés d'après la liste : « vide » se
 * juge sur ce que montre l'éditeur, pas sur le texte brut (un Genre
 * « Shonen » est un thème, un « Teen » disparaît : les genres sont vides).
 */
const fillGenres = (
    current: { genre?: string; tags?: string },
    sheet: SeriesSheet,
    catalog: GenreEntry[],
    overwrite: boolean,
) => {
    const now = classify(current.genre, current.tags, catalog);
    const found = classify(sheet.genre, sheet.tags, catalog);
    const takeGenres = (overwrite || !now.genres.length) && found.genres.length;
    const takeThemes = (overwrite || !now.themes.length) && found.themes.length;
    // Rien de la fiche : les champs restent tels quels.
    if (!takeGenres && !takeThemes) return undefined;
    return {
        genre: (takeGenres ? found.genres : now.genres).join(', '),
        tags: (takeThemes ? found.themes : now.themes).join(', '),
    };
};

/**
 * Champs de série depuis une fiche en ligne. Le résumé ne va que sur le
 * premier tome. Sans `overwrite`, seuls les champs vides sont remplis. Avec
 * la liste des genres (`catalog`), genres et thèmes sont rangés et remplis
 * d'après ce que l'éditeur en montre.
 */
export const fillFromSheet = (
    edits: Edits,
    paths: string[],
    sheet: SeriesSheet,
    overwrite: boolean,
    catalog?: GenreEntry[],
): Edits => {
    const genres = catalog
        ? fillGenres(
              {
                  genre: seriesValue(edits, paths, 'Genre'),
                  tags: seriesValue(edits, paths, 'Tags'),
              },
              sheet,
              catalog,
              overwrite,
          )
        : undefined;
    const values: Partial<Record<SeriesField, string | number | undefined>> = {
        Series: sheet.title,
        ...(!catalog && { Genre: sheet.genre, Tags: sheet.tags }),
        Writer: sheet.writer,
        Penciller: sheet.penciller,
        Publisher: sheet.publisher,
        AgeRating: sheet.ageRating,
    };
    let next = edits;
    for (const [field, value] of Object.entries(values) as [
        SeriesField,
        string | number,
    ][]) {
        if (isEmpty(value)) continue;
        for (const path of paths) {
            if (fillable(next[path]?.[field], overwrite)) {
                next = setVolumeField(next, path, field, value as never);
            }
        }
    }
    // Genres et thèmes sur tous les tomes, rangés : un tome n'en garde pas
    // d'autres que ceux affichés.
    if (genres) {
        for (const path of paths) {
            next = setVolumeField(next, path, 'Genre', genres.genre);
            next = setVolumeField(next, path, 'Tags', genres.tags);
        }
    }
    const first = paths[0];
    if (first && sheet.summary && fillable(next[first]?.Summary, overwrite)) {
        next = setVolumeField(next, first, 'Summary', sheet.summary);
    }
    return next;
};

/** Champs de série depuis Wikipédia (voir `fillFromSheet`). */
export const fillFromWikipedia = (
    edits: Edits,
    paths: string[],
    wiki: WikipediaSeries,
    overwrite: boolean,
): Edits => fillFromSheet(edits, paths, sheetFromWikipedia(wiki), overwrite);

const same = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '');

/** Le champ d'un tome diffère de sa valeur enregistrée. */
export const isFieldChanged = (
    original: Edits,
    edits: Edits,
    path: string,
    field: keyof ComicInfo,
) => !same(original[path]?.[field], edits[path]?.[field]);

/** Le champ de série diffère, sur au moins un tome, de sa valeur enregistrée. */
export const isSeriesFieldChanged = (
    original: Edits,
    edits: Edits,
    paths: string[],
    field: SeriesField,
) => paths.some((path) => isFieldChanged(original, edits, path, field));

/** Le champ de série revient, tome par tome, à sa valeur enregistrée. */
export const revertSeriesField = (
    edits: Edits,
    original: Edits,
    paths: string[],
    field: SeriesField,
): Edits =>
    paths.reduce(
        (next, path) =>
            setVolumeField(next, path, field, original[path]?.[field]),
        edits,
    );

/** Champs modifiés d'un tome (null : champ retiré). */
export const changesOf = (
    original: ComicInfo,
    edited: ComicInfo,
): Partial<Record<keyof ComicInfo, string | number | null>> => {
    const changes: Partial<Record<keyof ComicInfo, string | number | null>> =
        {};
    const fields = new Set([
        ...Object.keys(original),
        ...Object.keys(edited),
    ]) as Set<keyof ComicInfo>;
    for (const field of fields) {
        const before = original[field];
        const after = edited[field];
        if (same(before, after)) continue;
        changes[field] = isEmpty(after) ? null : (after as string | number);
    }
    return changes;
};
