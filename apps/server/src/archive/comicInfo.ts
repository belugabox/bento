import { promisify } from 'node:util';
import { parseString } from 'xml2js';

/** Métadonnées d'un tome (ComicInfo.xml, format Anansi). */
export type ComicInfo = {
    Title?: string;
    Series?: string;
    Number?: string;
    Count?: number;
    Volume?: number;
    AlternateSeries?: string;
    AlternateNumber?: string;
    AlternateCount?: number;
    Summary?: string;
    Notes?: string;
    Year?: number;
    Month?: number;
    Day?: number;
    Writer?: string;
    Penciller?: string;
    Inker?: string;
    Colorist?: string;
    Letterer?: string;
    CoverArtist?: string;
    Editor?: string;
    Publisher?: string;
    Imprint?: string;
    Genre?: string;
    // Thèmes (ComicInfo 2.1).
    Tags?: string;
    Web?: string;
    PageCount?: number;
    LanguageISO?: string;
    Format?: string;
    BlackAndWhite?: string;
    Manga?: string;
    Characters?: string;
    Teams?: string;
    Locations?: string;
    ScanInformation?: string;
    /** Groupement de tomes, libre (« Part 1 - Rouge, Bleu et Jaune »). */
    StoryArc?: string;
    StoryArcNumber?: string;
    SeriesGroup?: string;
    AgeRating?: string;
    CommunityRating?: number;
    MainCharacterOrTeam?: string;
    Review?: string;
};

const parseXml = promisify(parseString) as unknown as (
    xml: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<{ ComicInfo?: any }>;

/** xml2js renvoie des tableaux : extrait le premier élément. */
const extractValue = <T>(value: T[] | T | undefined): T | undefined =>
    Array.isArray(value) ? value[0] : value;

/** Extrait un nombre depuis une valeur xml2js (tableau/chaîne/nombre). */
const extractNumber = (
    value: (string | number)[] | string | number | undefined,
): number | undefined => {
    const val = extractValue(value);
    if (val === undefined || val === null) return undefined;
    const num = Number(val);
    return isNaN(num) ? undefined : num;
};

const STRING_FIELDS = [
    'Title',
    'Series',
    'Number',
    'AlternateSeries',
    'AlternateNumber',
    'Summary',
    'Notes',
    'Writer',
    'Penciller',
    'Inker',
    'Colorist',
    'Letterer',
    'CoverArtist',
    'Editor',
    'Publisher',
    'Imprint',
    'Genre',
    'Tags',
    'Web',
    'LanguageISO',
    'Format',
    'BlackAndWhite',
    'Manga',
    'Characters',
    'Teams',
    'Locations',
    'ScanInformation',
    'StoryArc',
    'StoryArcNumber',
    'SeriesGroup',
    'AgeRating',
    'MainCharacterOrTeam',
    'Review',
] as const;

export const NUMBER_FIELDS = [
    'Count',
    'Volume',
    'AlternateCount',
    'Year',
    'Month',
    'Day',
    'PageCount',
    'CommunityRating',
] as const;

/** Normalise un objet ComicInfo brut (xml2js) ; les champs vides sont omis. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const normalizeComicInfo = (raw: any): ComicInfo => {
    const info: Record<string, string | number> = {};
    for (const field of STRING_FIELDS) {
        const value = extractValue<unknown>(raw[field]);
        if (typeof value === 'string' && value.trim() !== '') {
            info[field] = value.trim();
        }
    }
    for (const field of NUMBER_FIELDS) {
        const value = extractNumber(raw[field]);
        if (value !== undefined) info[field] = value;
    }
    return info as ComicInfo;
};

/** Lit le ComicInfo.xml d'une archive ({} s'il est absent ou illisible). */
export const readComicInfo = async (
    entries: {
        entryName: string;
        getData: () => Buffer | Promise<Buffer>;
    }[],
): Promise<ComicInfo> => {
    const entry = entries.find(
        (e) => e.entryName.toLowerCase() === 'comicinfo.xml',
    );
    if (!entry) return {};
    try {
        const parsed = await parseXml(
            (await entry.getData()).toString('utf-8'),
        );
        return parsed.ComicInfo ? normalizeComicInfo(parsed.ComicInfo) : {};
    } catch {
        return {};
    }
};
