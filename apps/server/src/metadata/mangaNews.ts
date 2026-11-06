import { type CheerioAPI, load as cheerioLoad } from 'cheerio';

import { genreKey } from '../classification';
import { type AgeRating, ratingForAge } from '../library/ageRating';
import { badGateway, badRequest, notFound } from '../tools/errors';

// Métadonnées de séries depuis Manga-news. Le site n'a pas d'API : ses
// pages sont lues à la demande de l'admin, une à la fois, jamais en masse.
// Une protection anti-robot n'est jamais contournée.
const BASE_URL = 'https://www.manga-news.com/index.php';
const USER_AGENT = 'bento/1.0 (https://github.com/belugabox/bento)';
const TIMEOUT_MS = 15_000;
const MAX_RESULTS = 15;

export type MangaNewsResult = {
    /** Fin de l'adresse de la fiche (`/serie/<id>`). */
    id: string;
    title: string;
    year?: number;
    authors?: string;
    coverUrl?: string;
};

export type MangaNewsSeries = {
    id: string;
    title: string;
    url: string;
    originalTitle: string;
    writer: string;
    penciller: string;
    publisher: string;
    /** Nom du format (« Manga », « Manhwa »…), à rapprocher des formats gérés. */
    format: string | null;
    /** Genres tels que les nomme Manga-news (rangés ensuite par la liste). */
    genres: string[];
    themes: string[];
    year?: number;
    summary: string;
    /** Âge conseillé (« 12+ ») et classification ComicInfo correspondante. */
    age?: number;
    ageRating?: AgeRating;
    volumeCount?: number;
    ongoing?: boolean;
    coverUrl?: string;
};

const seriesUrl = (id: string) =>
    `${BASE_URL}/serie/${encodeURIComponent(id).replace(/%3A/gi, ':')}`;

// Octets 0x80 à 0x9f de Windows-1252 (le reste est ISO-8859-1). Le
// TextDecoder de Node 22 les lit en ISO-8859-1 : « ’ » y serait perdu.
const WINDOWS_1252 =
    '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

/**
 * Texte d'une page : les pages de Manga-news sont en UTF-8 ou en
 * Windows-1252 selon leur âge, quel que soit l'en-tête.
 */
export const decodePage = (bytes: ArrayBuffer | Uint8Array) => {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return Buffer.from(bytes as Uint8Array)
            .toString('latin1')
            .replace(/[\u0080-\u009f]/g, (c) =>
                WINDOWS_1252.charAt(c.charCodeAt(0) - 0x80),
            );
    }
};

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Adresse complète d'une image (« public/images/… » est relative au site). */
const absolute = (src: string | undefined) =>
    src ? new URL(src, 'https://www.manga-news.com/').toString() : undefined;

// Type de Manga-news : un format pour les séries coréennes, chinoises et
// les webtoons (sinon un public, shonen…, qui n'est pas gardé).
const TYPE_FORMATS: Record<string, string> = {
    manhwa: 'Manhwa',
    manhua: 'Manhua',
    webtoon: 'Webtoon',
    'webtoon webcomic': 'Webtoon',
};

// Pays d'origine → format.
const COUNTRY_FORMATS: Record<string, string> = {
    japon: 'Manga',
    coree: 'Manhwa',
    'coree du sud': 'Manhwa',
    chine: 'Manhua',
    taiwan: 'Manhua',
    'hong kong': 'Manhua',
    france: 'BD',
    belgique: 'BD',
    suisse: 'BD',
    usa: 'Comics',
    'etats unis': 'Comics',
};

/** Liens d'une ligne de la fiche (« Dessin : A, B »), séparés par des virgules. */
const linksOf = ($: CheerioAPI, selector: string) =>
    $(selector)
        .find('a')
        .map((_, a) => clean($(a).text()))
        .get()
        .filter(Boolean)
        .join(', ');

/** Fiche d'une série, d'après le HTML de sa page. */
export const parseSeriesPage = (
    html: string,
    id: string,
): MangaNewsSeries | undefined => {
    const $ = cheerioLoad(html);
    const title = clean($('h1.entry-page-title').first().text());
    if (!title) return undefined;

    const type = genreKey(clean($('li.book-type').find('a').first().text()));
    const origin = clean(
        $('li.book-origin')
            .text()
            .replace(/^\s*Origine\s*:?/i, ''),
    );
    const country = genreKey(origin.split(/\s+-\s+/)[0] ?? '');
    const year = Number(/\b(\d{4})\b/.exec(origin)?.[1]) || undefined;

    const ageText = clean($('#agenumber').text());
    const age = /^(\d+)\s*\+/.exec(ageText)?.[1];
    const tout = /tout public/i.test(ageText);
    const ageValue = age !== undefined ? Number(age) : tout ? 0 : undefined;

    // « VF: 16 (En cours) ».
    const vf = clean($('#numberblock > div').first().text());
    const volumes = /VF\s*:?\s*(\d+)\s*(?:\(([^)]*)\))?/i.exec(vf);

    // Résumé : les sauts de ligne de la page sont gardés.
    const summary = $('#summary .bigsize').first();
    summary.find('br').replaceWith('\n');

    return {
        id,
        title,
        url: seriesUrl(id),
        originalTitle: clean(
            $('li.title-vo .entry-data-wrapper').text().replace(/^:\s*/, ''),
        ),
        writer: linksOf($, 'li.book-by2'),
        penciller: linksOf($, 'li.book-by'),
        publisher: $('li.book-edit-vf a')
            .map((_, a) => clean($(a).text()))
            .get()
            .filter(Boolean)
            .join(', '),
        format: TYPE_FORMATS[type] ?? COUNTRY_FORMATS[country] ?? null,
        genres: $('li.book-genre a')
            .map((_, a) => clean($(a).text()))
            .get()
            .filter(Boolean),
        themes: $('#themelist a.theme-item')
            .map((_, a) => clean($(a).text()))
            .get()
            .filter(Boolean),
        year,
        summary: summary
            .text()
            .split('\n')
            .map(clean)
            .filter(Boolean)
            .join('\n'),
        ...(ageValue !== undefined && {
            age: ageValue,
            ageRating: ratingForAge(ageValue),
        }),
        ...(volumes && {
            volumeCount: Number(volumes[1]),
            ...(volumes[2] && {
                ongoing: !/termin/i.test(volumes[2]),
            }),
        }),
        // Image en grand (le lien), sinon celle affichée.
        coverUrl: absolute(
            $('#picinfo a.cpModal').attr('href') ??
                $('#picinfo img.entryPicture').attr('src'),
        ),
    };
};

/** Séries de la recherche : la seule section « Séries Manga VF ». */
export const parseSearchPage = (html: string): MangaNewsResult[] => {
    const $ = cheerioLoad(html);
    const section = $('.searchCat')
        .filter((_, el) =>
            /s[ée]ries manga vf/i.test($(el).find('.headerTitle').text()),
        )
        .first();
    const results: MangaNewsResult[] = [];
    section.find('li.resManga a').each((_, a) => {
        const href = $(a).attr('href') ?? '';
        const id = /\/serie\/([^/?#]+)/.exec(href)?.[1];
        if (!id) return;
        const heading = clean($(a).find('.searchTitle').text());
        const year = /\((\d{4})\)$/.exec(heading)?.[1];
        results.push({
            id: decodeURIComponent(id),
            title: heading.replace(/\s*\(\d{4}\)$/, ''),
            ...(year && { year: Number(year) }),
            authors: clean($(a).find('.searchAut').text()) || undefined,
            coverUrl: absolute($(a).find('img').attr('src')),
        });
    });
    return results.slice(0, MAX_RESULTS);
};

export class MangaNews {
    constructor(private readonly fetchFn: typeof fetch = fetch) {}

    private get = async (url: string) => {
        let response: Response;
        try {
            response = await this.fetchFn(url, {
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept-Language': 'fr',
                },
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } catch (error) {
            const reason =
                error instanceof Error ? error.message : String(error);
            throw badGateway(`Manga-news injoignable : ${reason}`);
        }
        const html = decodePage(await response.arrayBuffer());
        // Contrôle anti-robot : jamais contourné. Cloudflare le signale par
        // `cf-mitigated: challenge` ou une page « Just a moment » (le script
        // « challenge-platform » de toutes les pages ne compte pas). Il peut
        // être ponctuel : un nouvel essai passe parfois.
        if (
            response.headers.get('cf-mitigated') === 'challenge' ||
            /<title>\s*(Just a moment|Attention Required)/i.test(html)
        ) {
            throw badGateway(
                `Manga-news refuse la requête (protection anti-robot, ${response.status}) : réessaie plus tard ou utilise Wikipédia`,
            );
        }
        if (response.status === 429) {
            throw badGateway(
                'Manga-news limite les requêtes : réessaie dans quelques secondes',
            );
        }
        if (response.status === 404) return undefined;
        if (!response.ok) {
            throw badGateway(
                `Manga-news indisponible (${response.status}) : réessaie dans un instant`,
            );
        }
        return html;
    };

    /** Séries dont le titre correspond au texte. */
    search = async (text: string) => {
        const html = await this.get(
            `${BASE_URL}/recherche/?q=${encodeURIComponent(text)}`,
        );
        return html ? parseSearchPage(html) : [];
    };

    /** Fiche d'une série, par la fin de son adresse. */
    series = async (id: string) => {
        if (!/^[^/?#\\\s]+$/.test(id)) {
            throw badRequest('Identifiant Manga-news invalide');
        }
        const html = await this.get(seriesUrl(id));
        const series = html && parseSeriesPage(html, id);
        if (!series) throw notFound(`Série introuvable sur Manga-news (${id})`);
        return series;
    };
}
