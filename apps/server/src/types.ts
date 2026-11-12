// Types partagés avec le client (importés via `@server/types`).
export type { ApiType } from './api';
export {
    PASSWORD_MIN_LENGTH,
    USERNAME_PATTERN,
    USERNAME_RULE,
    isAvatarSeed,
    safeRedirect,
} from './auth/rules';
export {
    AVATAR_BACKGROUNDS,
    AVATAR_BODY_COLORS,
    AVATAR_VARIANTS,
    type AvatarChoice,
    formatAvatar,
    parseAvatar,
    randomAvatar,
} from './auth/avatarParts';
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
    type SheetVolume,
    SOURCE_LABELS,
    type SourceLink,
    type SourcePriority,
    parseSources,
    sourceUrl,
} from './metadata/sourceLink';
export { parseVolumeFileName } from './archive/fileName';
export type { ComicInfo } from './archive/comicInfo';
export { publicationPathOf } from './library/publication';
export {
    type Completeness,
    type CompletenessInput,
    type VolumeCounts,
    completenessOf,
    fieldsFromVolumes,
} from './library/completeness';
export {
    KIND_FORMATS,
    VOLUME_KIND_LABELS,
    VOLUME_KINDS,
    MAIN_KINDS,
    isMainKind,
    isStandalone,
    kindTitle,
    type VolumeKind,
    kindOfWord,
    volumeNumbering,
} from './library/volumeKind';
export { articleFirst, compareNames, sortKeyOf } from './library/sortName';
export {
    nameVariant,
    sameSeriesName,
    seriesNameKey,
} from './metadata/seriesNames';
export {
    PAGE_WIDTHS,
    type PageWidth,
    isPageWidth,
    pageWidthFor,
} from './library/pageWidths';
