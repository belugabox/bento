import type { MetadataSource, SourceLink } from '@server/types';

import { ratingLabel, reviewsLabel } from '@/components/format';
import {
    type BedethequeDetails,
    type MangaNewsDetails,
    type WikipediaDetails,
    fetchBedethequeSeries,
    fetchMangaNewsSeries,
    fetchWikipediaSeries,
} from '@/services/api';

import {
    type SeriesSheet,
    sheetFromBedetheque,
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
    /** Note des lecteurs de la fiche (gardée par le serveur à sa lecture). */
    rating?: { value: number; count: number };
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
    rating: details.rating,
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
        details.rating
            ? `${ratingLabel(details.rating.value)} (${reviewsLabel(details.rating.count)})`
            : '',
    ].filter(Boolean),
});

const fromBedetheque = (details: BedethequeDetails): Preview => ({
    source: 'bedetheque',
    id: details.id,
    title: details.title,
    url: details.url,
    coverUrl: details.coverUrl,
    sheet: sheetFromBedetheque(details),
    rating: details.rating,
    lines: [
        [details.origin, details.oneShot ? 'One shot' : '']
            .filter(Boolean)
            .join(' · '),
        details.genres.join(', '),
        details.writer,
        details.publisher,
        details.firstYear
            ? details.lastYear
                ? `${details.firstYear} – ${details.lastYear}`
                : String(details.firstYear)
            : '',
        details.volumeCount && !details.oneShot
            ? `${details.volumeCount} tomes${details.ongoing === undefined ? '' : details.ongoing ? ' (en cours)' : ' (terminée)'}`
            : '',
        details.rating
            ? `${ratingLabel(details.rating.value)} (${reviewsLabel(details.rating.count)})`
            : '',
    ].filter(Boolean),
});

/** Fiche déjà connue d'une série, relue sur son site. */
export const loadFound = async ({ site, id }: SourceLink): Promise<Preview> =>
    site === 'wikipedia'
        ? fromWikipedia(await fetchWikipediaSeries(Number(id)))
        : site === 'bedetheque'
          ? fromBedetheque(await fetchBedethequeSeries(id))
          : fromMangaNews(await fetchMangaNewsSeries(id));

/**
 * Sites interrogés, le plus utile d'abord (Manga-news pour un manga,
 * Bedetheque pour une BD), sans ceux désactivés dans les réglages.
 */
export const sitesFor = (
    kind: 'manga' | 'comics',
    disabled: readonly MetadataSource[] = [],
): MetadataSource[] =>
    (kind === 'manga'
        ? (['manga-news', 'wikipedia', 'bedetheque'] as const)
        : (['bedetheque', 'wikipedia', 'manga-news'] as const)
    ).filter((site) => !disabled.includes(site));
