import { load as cheerioLoad } from 'cheerio';

import { articleFirst } from '../library/sortName';
import { badGateway, notFound, refused } from '../tools/errors';
import { type SeriesRating, bedethequeSeriesUrl } from './sourceLink';

// Métadonnées de séries depuis Bedetheque (BD, comics, romans graphiques,
// mangas). Le site n'a pas d'API : la recherche passe par son
// autocomplétion (JSON), la fiche par la page de la série. Lues à la
// demande de l'admin, une à la fois ; une protection anti-robot n'est
// jamais contournée.
const BASE_URL = 'https://www.bedetheque.com';
const USER_AGENT = 'bento/1.0 (https://github.com/belugabox/bento)';
const TIMEOUT_MS = 15_000;
const MAX_RESULTS = 15;
// Nouvel essai après un refus ponctuel, une seule fois.
const RETRY_DELAY_MS = 2_000;
// Pages lues gardées 10 minutes, 50 au plus.
const CACHE_MS = 10 * 60_000;
const MAX_CACHED = 50;

export type BedethequeResult = {
    /** Identifiant de la série (IdBEL). */
    id: string;
    title: string;
    /** Pays de l'édition (« France », « USA »), d'après son drapeau. */
    country?: string;
};

export type BedethequeSeries = {
    id: string;
    title: string;
    url: string;
    /** Genres (« Policier », « Roman graphique »). */
    genres: string[];
    /** Origine : « Franco-Belge », « Comics », « Manga »… */
    origin: string;
    writer: string;
    penciller: string;
    publisher: string;
    summary: string;
    volumeCount?: number;
    firstYear?: number;
    lastYear?: number;
    /** En cours, ou terminée (one shot compris) ; inconnu sinon. */
    ongoing?: boolean;
    oneShot: boolean;
    coverUrl?: string;
    /** Note des lecteurs (moyenne des albums), sur 5. */
    rating?: SeriesRating;
};

/**
 * Note de la série : celles des lecteurs pour chaque album (« Note : 4.3/5
 * (127 votes) »), en moyenne pondérée par leurs votes.
 */
export const parseAlbumRatings = (html: string): SeriesRating | undefined => {
    let sum = 0;
    let count = 0;
    for (const match of html.matchAll(
        /Note\s*:\s*<strong>([\d.]+)<\/strong>\s*\/\s*5\s*\((\d+)\s*votes?\)/g,
    )) {
        const votes = Number(match[2]);
        sum += Number(match[1]) * votes;
        count += votes;
    }
    return count > 0
        ? { value: Math.round((sum / count) * 10) / 10, count }
        : undefined;
};

const clean = (text: string | undefined) =>
    (text ?? '').replace(/\s+/g, ' ').trim();

/** « Mazzucchelli, David » devient « David Mazzucchelli ». */
export const authorName = (name: string) => {
    const [last, first] = name.split(',').map((part) => part.trim());
    return first ? `${first} ${last}` : (last ?? '');
};

/** Résultats de l'autocomplétion des séries. */
export const parseSearch = (json: unknown): BedethequeResult[] =>
    (Array.isArray(json) ? json : [])
        .flatMap((item: { id?: unknown; label?: unknown; desc?: unknown }) => {
            const id = String(item.id ?? '');
            if (!/^\d+$/.test(id) || typeof item.label !== 'string') return [];
            const country = /flags\/([^./]+)\.png/.exec(String(item.desc))?.[1];
            return [
                {
                    id,
                    // Entités HTML parfois laissées dans le libellé ;
                    // « Sculpteur (Le) » devient « Le Sculpteur ».
                    title: articleFirst(
                        cheerioLoad(`<p>${item.label}</p>`)('p').text(),
                    ),
                    ...(country && { country }),
                },
            ];
        })
        .slice(0, MAX_RESULTS);

/**
 * Fiche d'une série : en-tête (genres, parution, années, tomes, origine),
 * résumé, et auteurs, éditeur, couverture du premier album.
 */
export const parseSeriesPage = (
    html: string,
    id: string,
): BedethequeSeries | undefined => {
    const $ = cheerioLoad(html);
    const header = $('section.bdt-ah--serie');
    const title = clean(header.find('h1 a').first().text());
    if (!title) return undefined;

    const parution = clean(header.find('.bdt-sh-parution').text());
    const byLine = clean(header.find('.bdt-ah-by').text());
    const years = [...byLine.matchAll(/\b(1[89]\d{2}|20\d{2})\b/g)].map((m) =>
        Number(m[1]),
    );
    const pastille = (label: RegExp) =>
        clean(
            header
                .find('.bdt-ah-pastilles li')
                .filter((_, li) => label.test($(li).attr('title') ?? ''))
                .first()
                .text(),
        );
    const volumeCount = Number(/(\d+)/.exec(pastille(/Nombre de tomes/))?.[1]);
    const oneShot = /one shot/i.test(parution);

    // Premier album : ses auteurs (scénario, dessin), éditeur et couverture.
    const credit = (role: RegExp) => {
        const names: string[] = [];
        $('dt').each((_, dt) => {
            if (names.length || !role.test(clean($(dt).text()))) return;
            $(dt)
                .next('dd')
                .find('span[itemprop]')
                .each((_, span) => {
                    names.push(authorName(clean($(span).text())));
                });
        });
        return names.join(', ');
    };

    return {
        id,
        title,
        url: bedethequeSeriesUrl(id),
        genres: header
            .find('.bdt-sh-genre')
            .map((_, a) => clean($(a).text()))
            .get()
            .filter(Boolean),
        origin: pastille(/Origine/),
        writer: credit(/^Sc[ée]nario$/i),
        penciller: credit(/^Dessin$/i),
        publisher: clean($('[itemprop="publisher"]').first().text()),
        summary: clean($('.bdt-sh-resume').first().text()),
        ...(volumeCount && { volumeCount }),
        ...(years[0] && { firstYear: years[0] }),
        ...(years.length > 1 && { lastYear: years.at(-1) }),
        ongoing: oneShot
            ? false
            : /en cours/i.test(parution)
              ? true
              : /finie|termin/i.test(parution)
                ? false
                : undefined,
        oneShot,
        coverUrl: $('img[itemprop="image"]').first().attr('src'),
        ...(parseAlbumRatings(html) && { rating: parseAlbumRatings(html) }),
    };
};

/** Réponse lue, avant d'être jugée (`Bedetheque.get`). */
type Page = { status: number; challenged: boolean; body: string };

export class Bedetheque {
    // Pages déjà lues, gardées un moment : la recherche, puis la fiche
    // ouverte, puis « Mettre à jour » ne redemandent pas la même page.
    private cache = new Map<string, { body: string; until: number }>();

    constructor(
        private readonly fetchFn: typeof fetch = fetch,
        private readonly options: {
            retryDelayMs?: number;
            cacheMs?: number;
        } = {},
    ) {}

    private fetchPage = async (url: string): Promise<Page> => {
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
            throw badGateway(`Bedetheque injoignable : ${reason}`);
        }
        const body = await response.text();
        return {
            status: response.status,
            // Contrôle anti-robot de Cloudflare (le script
            // « challenge-platform » de toutes les pages ne compte pas).
            challenged:
                response.headers.get('cf-mitigated') === 'challenge' ||
                /<title>\s*(Just a moment|Attention Required)/i.test(body),
            body,
        };
    };

    /**
     * Page lue (ou gardée) ; `retry: false` : pas de nouvel essai après un
     * refus (mise à jour en arrière-plan, qui s'arrête alors).
     */
    private get = async (url: string, { retry = true } = {}) => {
        const cached = this.cache.get(url);
        if (cached && cached.until > Date.now()) return cached.body;

        let page = await this.fetchPage(url);
        // Refus ponctuel : la même requête, refaite une seule fois après une
        // pause. Le contrôle n'est jamais contourné (ni résolu, ni déguisé).
        if (retry && (page.challenged || page.status === 429)) {
            await new Promise((resolve) =>
                setTimeout(
                    resolve,
                    this.options.retryDelayMs ?? RETRY_DELAY_MS,
                ),
            );
            page = await this.fetchPage(url);
        }
        if (page.challenged) {
            throw refused(
                `Bedetheque refuse la requête (protection anti-robot, ${page.status}) : réessaie plus tard`,
            );
        }
        if (page.status === 429) {
            throw refused(
                'Bedetheque limite les requêtes : réessaie dans quelques secondes',
            );
        }
        if (page.status === 404) return undefined;
        if (page.status < 200 || page.status >= 300) {
            throw badGateway(
                `Bedetheque indisponible (${page.status}) : réessaie dans un instant`,
            );
        }
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (entry.until <= now) this.cache.delete(key);
        }
        while (this.cache.size >= MAX_CACHED) {
            this.cache.delete(this.cache.keys().next().value!);
        }
        this.cache.set(url, {
            body: page.body,
            until: now + (this.options.cacheMs ?? CACHE_MS),
        });
        return page.body;
    };

    /** Séries dont le nom correspond au texte (autocomplétion du site). */
    search = async (text: string) => {
        const body = await this.get(
            `${BASE_URL}/ajax/series?term=${encodeURIComponent(text)}`,
        );
        if (!body) return [];
        try {
            return parseSearch(JSON.parse(body));
        } catch {
            throw badGateway('Bedetheque a répondu autre chose que prévu');
        }
    };

    /** Fiche d'une série, par son identifiant. */
    series = async (id: string, options?: { retry?: boolean }) => {
        const html = await this.get(bedethequeSeriesUrl(id), options);
        const series = html && parseSeriesPage(html, id);
        if (!series) throw notFound(`Série introuvable sur Bedetheque (${id})`);
        return series;
    };
}
