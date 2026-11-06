import {
    type ComicInfo,
    type GenreEntry,
    KIND_FORMATS,
    METADATA_SOURCES,
    type MetadataSource,
    SHEET_FIELDS,
    type SheetField,
    type SourcePriority,
    VOLUME_KIND_LABELS,
    type VolumeKind,
    classify,
    genreKey,
    kindOfWord,
    parseVolumeFileName,
    volumeNumbering,
} from '@server/types';

import { type KnownNames, cleanNames } from './credits';

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

/** Type d'un tome (tome, hors-série, spécial), d'après son ComicInfo. */
export const volumeKindOf = (info: ComicInfo): VolumeKind =>
    volumeNumbering(info).kind;

/**
 * Change le type d'un tome : gardé dans le champ `Format` du ComicInfo
 * (retiré pour un tome) ; un numéro préfixé (« HS01 ») devient un nombre.
 */
export const setVolumeKind = (
    edits: Edits,
    path: string,
    kind: VolumeKind,
): Edits => {
    const info = edits[path] ?? {};
    let next = edits;
    const { number } = volumeNumbering(info);
    if (number && number !== info.Number?.trim()) {
        next = setVolumeField(next, path, 'Number', number);
    }
    if (kind !== 'volume') {
        return setVolumeField(next, path, 'Format', KIND_FORMATS[kind]);
    }
    // Un autre Format (« TPB ») n'est pas un type : gardé.
    return kindOfWord(info.Format)
        ? setVolumeField(next, path, 'Format', undefined)
        : next;
};

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
        // « HS01 », « SP01 » : hors-série, spécial (type d'un tome sinon).
        if (parsed.kind && (overwrite || !kindOfWord(info.Format))) {
            next = setVolumeKind(next, volume.path, parsed.kind);
        }
        // Titre par défaut : « Tome N », « Hors-série N ».
        const { kind, number } = volumeNumbering(next[volume.path] ?? {});
        if (number && fillable(info.Title, overwrite)) {
            next = setVolumeField(
                next,
                volume.path,
                'Title',
                `${VOLUME_KIND_LABELS[kind]} ${number}`,
            );
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
 * Valeurs d'une série comme l'éditeur les garde : texte, id du format, âge,
 * statut, genres et thèmes rangés d'après la liste (« Suspense » devient
 * « Thriller »). Une valeur vide n'y figure pas.
 */
export type SheetValues = Partial<Record<SheetField, string>>;

const withoutEmpty = (values: Record<string, string | undefined>) =>
    Object.fromEntries(
        Object.entries(values).filter(([, value]) => !!value?.trim()),
    ) as SheetValues;

/**
 * Valeurs d'une fiche en ligne : le format parmi ceux des réglages, les
 * noms nettoyés (`cleanNames`) d'après ceux déjà connus.
 */
export const sheetValues = (
    sheet: SeriesSheet,
    catalog: GenreEntry[],
    formats: { id: number; name: string }[],
    known: KnownNames = { people: [], publishers: [] },
): SheetValues => {
    const { genres, themes } = classify(sheet.genre, sheet.tags, catalog);
    const wanted = sheet.format ? genreKey(sheet.format) : undefined;
    const format = formats.find((f) => genreKey(f.name) === wanted);
    return withoutEmpty({
        Series: sheet.title,
        Format: format && String(format.id),
        Age: sheet.age === undefined ? undefined : String(sheet.age),
        Status: sheet.status,
        Genre: genres.join(', '),
        Tags: themes.join(', '),
        Writer: cleanNames(sheet.writer, known.people),
        Penciller: cleanNames(sheet.penciller, known.people),
        Publisher: cleanNames(sheet.publisher, known.publishers),
        Summary: sheet.summary,
    });
};

/**
 * Valeurs saisies dans les tomes : genres et thèmes rangés comme l'éditeur
 * les montre (un Genre « Shonen » est un thème), résumé du premier tome.
 */
export const editedValues = (
    edits: Edits,
    paths: string[],
    catalog: GenreEntry[],
): SheetValues => {
    const text = (field: SeriesField) =>
        String(seriesValue(edits, paths, field) ?? '');
    const { genres, themes } = classify(text('Genre'), text('Tags'), catalog);
    const first = paths[0];
    return withoutEmpty({
        Series: text('Series'),
        Genre: genres.join(', '),
        Tags: themes.join(', '),
        Writer: text('Writer'),
        Penciller: text('Penciller'),
        Publisher: text('Publisher'),
        Summary: first ? edits[first]?.Summary : undefined,
    });
};

/** Valeur gardée pour un champ : l'actuelle, ou celle d'une fiche. */
export type SheetChoice = 'current' | MetadataSource;

/** Une ligne du tableau de comparaison. */
export type ComparisonRow = {
    field: SheetField;
    current?: string;
    found: Partial<Record<MetadataSource, string>>;
};

const sameValue = (a?: string, b?: string) =>
    (a ?? '').trim() === (b ?? '').trim();

/**
 * Lignes du tableau : les champs pour lesquels une fiche apporte une valeur
 * différente de l'actuelle.
 */
export const comparisonRows = (
    current: SheetValues,
    sheets: { site: MetadataSource; values: SheetValues }[],
): ComparisonRow[] =>
    SHEET_FIELDS.flatMap((field) => {
        const found = Object.fromEntries(
            sheets
                .filter((sheet) => sheet.values[field])
                .map((sheet) => [sheet.site, sheet.values[field]]),
        );
        return Object.values(found).some(
            (value) => !sameValue(value, current[field]),
        )
            ? [{ field, current: current[field], found }]
            : [];
    });

/**
 * Choix de départ : la valeur actuelle si le champ est rempli, sinon celle
 * du site préféré pour ce champ (réglages), sinon celle de l'autre fiche.
 */
export const defaultChoice = (
    row: ComparisonRow,
    priority: SourcePriority,
): SheetChoice => {
    if (row.current) return 'current';
    const preferred = priority[row.field];
    if (row.found[preferred]) return preferred;
    return METADATA_SOURCES.find((site) => row.found[site]) ?? 'current';
};

/** Nouvelles valeurs : celles des fiches choisies. */
export const chosenValues = (
    rows: ComparisonRow[],
    choices: Partial<Record<SheetField, SheetChoice>>,
): SheetValues =>
    Object.fromEntries(
        rows.flatMap((row) => {
            const choice = choices[row.field];
            const value =
                choice && choice !== 'current' ? row.found[choice] : undefined;
            return value === undefined ? [] : [[row.field, value]];
        }),
    );

/**
 * Applique aux tomes les valeurs choisies (champs du ComicInfo ; format,
 * âge et statut sont réglés par l'éditeur). Genres et thèmes sont réécrits
 * ensemble, rangés : un mot des fichiers rangé en thème le reste.
 */
export const applySheetValues = (
    edits: Edits,
    paths: string[],
    values: SheetValues,
    catalog: GenreEntry[],
): Edits => {
    let next = edits;
    for (const field of [
        'Series',
        'Writer',
        'Penciller',
        'Publisher',
    ] as const) {
        if (values[field] !== undefined) {
            next = setSeriesField(next, field, values[field]);
        }
    }
    if (values.Genre !== undefined || values.Tags !== undefined) {
        const now = editedValues(next, paths, catalog);
        next = setSeriesField(next, 'Genre', values.Genre ?? now.Genre);
        next = setSeriesField(next, 'Tags', values.Tags ?? now.Tags);
    }
    const first = paths[0];
    if (first && values.Summary !== undefined) {
        next = setVolumeField(next, first, 'Summary', values.Summary);
    }
    return next;
};

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
