import type { MetadataSource, SourceLink } from '@server/types';

import {
    type MangaNewsDetails,
    type WikipediaDetails,
    fetchMangaNewsSeries,
    fetchWikipediaSeries,
} from '@/services/api';

import {
    type SeriesSheet,
    sheetFromMangaNews,
    sheetFromWikipedia,
} from './editing';

/** Série choisie : sa fiche, son image et d'où elle vient. */
export type FoundSeries = {
    source: MetadataSource;
    /** Identifiant de la fiche sur son site (pour la retrouver). */
    id: string;
    title: string;
    url: string;
    coverUrl?: string;
    sheet: SeriesSheet;
};

/** Ce que montre l'aperçu d'une fiche, ligne par ligne. */
export type Preview = FoundSeries & { lines: string[]; themes?: string[] };

const fromWikipedia = (details: WikipediaDetails): Preview => ({
    source: 'wikipedia',
    id: String(details.id),
    title: details.title,
    url: details.url,
    coverUrl: details.coverUrl,
    sheet: sheetFromWikipedia(details),
    lines: [
        details.genre,
        details.writer,
        details.publisher,
        details.firstYear
            ? details.lastYear
                ? `${details.firstYear} – ${details.lastYear}`
                : `depuis ${details.firstYear}`
            : '',
        details.volumeCount ? `${details.volumeCount} tomes` : '',
    ].filter(Boolean),
});

const fromMangaNews = (details: MangaNewsDetails): Preview => ({
    source: 'manga-news',
    id: details.id,
    title: details.title,
    url: details.url,
    coverUrl: details.coverUrl,
    sheet: sheetFromMangaNews(details),
    themes: details.themes,
    lines: [
        [details.format, details.year].filter(Boolean).join(' · '),
        details.genres.join(', '),
        details.writer,
        details.publisher,
        details.volumeCount
            ? `${details.volumeCount} tomes en VF${details.ongoing === undefined ? '' : details.ongoing ? ' (en cours)' : ' (terminée)'}`
            : '',
        details.age !== undefined
            ? `Âge conseillé : ${details.age === 0 ? 'tout public' : `${details.age}+`}`
            : '',
    ].filter(Boolean),
});

/** Fiche déjà connue d'une série, relue sur son site. */
export const loadFound = async ({ site, id }: SourceLink): Promise<Preview> =>
    site === 'wikipedia'
        ? fromWikipedia(await fetchWikipediaSeries(Number(id)))
        : fromMangaNews(await fetchMangaNewsSeries(id));

/** Sites interrogés, le plus utile d'abord (Manga-news pour un manga). */
export const sitesFor = (kind: 'manga' | 'comics'): MetadataSource[] =>
    kind === 'manga'
        ? ['manga-news', 'wikipedia']
        : ['wikipedia', 'manga-news'];
