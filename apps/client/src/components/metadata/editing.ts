import { type ComicInfo, parseVolumeFileName } from '@server/types';

/** Champs communs à toute la série, appliqués à chaque tome. */
export const SERIES_FIELDS = [
    'Series',
    'Count',
    'Genre',
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
    volumeCount: number;
};

/**
 * Champs de série depuis Wikipédia. Le résumé ne va que sur le premier
 * tome. Sans `overwrite`, seuls les champs vides sont remplis.
 */
export const fillFromWikipedia = (
    edits: Edits,
    paths: string[],
    wiki: WikipediaSeries,
    overwrite: boolean,
): Edits => {
    const values: Partial<Record<SeriesField, string | number>> = {
        Series: wiki.title,
        Genre: wiki.genre,
        Writer: wiki.writer,
        Penciller: wiki.penciller,
        Publisher: wiki.publisher,
        ...(wiki.volumeCount > 0 && { Count: wiki.volumeCount }),
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
    const first = paths[0];
    if (first && wiki.summary && fillable(next[first]?.Summary, overwrite)) {
        next = setVolumeField(next, first, 'Summary', wiki.summary);
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
