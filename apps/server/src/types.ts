// Types partagés avec le client (importés via `@server/types`).
export type { ApiType } from './api';
export { AGE_RATINGS, type AgeRating } from './library/ageRating';
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
    DEFAULT_GENRES,
    defaultFormat,
    type Format,
    FORMAT_LABELS,
    FORMATS,
    type GenreEntry,
    genreKey,
    splitList,
} from './classification';
export { parseVolumeFileName } from './archive/fileName';
export type { ComicInfo } from './archive/comicInfo';
export { publicationPathOf } from './library/publication';
export { articleFirst, compareNames, sortKeyOf } from './library/sortName';
