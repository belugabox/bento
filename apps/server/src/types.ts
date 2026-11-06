// Types partagés avec le client (importés via `@server/types`).
export type { ApiType } from './api';
export {
    AGE_RATINGS,
    type AgeRating,
    minAgeOf,
    ratingForAge,
} from './library/ageRating';
export {
    ACCENTS,
    type Accent,
    type Appearance,
    COLOR_SCHEMES,
    type ColorScheme,
} from './appearance';
export {
    classify,
    type Classification,
    ageLabel,
    DEFAULT_AGE_STEPS,
    DEFAULT_FORMATS,
    DEFAULT_GENRES,
    type FormatEntry,
    type GenreEntry,
    READING_MODES,
    type ReadingMode,
    genreKey,
    splitList,
} from './classification';
export {
    DEFAULT_SOURCE_PRIORITY,
    METADATA_SOURCES,
    type MetadataSource,
    SHEET_FIELD_LABELS,
    SHEET_FIELDS,
    type SheetField,
    SOURCE_LABELS,
    type SourceLink,
    type SourcePriority,
    parseSources,
    sourceUrl,
} from './metadata/sourceLink';
export { parseVolumeFileName } from './archive/fileName';
export type { ComicInfo } from './archive/comicInfo';
export { publicationPathOf } from './library/publication';
export { articleFirst, compareNames, sortKeyOf } from './library/sortName';
