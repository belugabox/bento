import { load as cheerioLoad } from 'cheerio';

import { badGateway, notFound } from '../tools/errors';
import type { SheetVolume } from './sourceLink';

// Métadonnées de séries depuis Wikipédia FR (API MediaWiki officielle).
// La politique Wikimedia demande un User-Agent qui identifie l'application.
const API_URL = 'https://fr.wikipedia.org/w/api.php';
const USER_AGENT = 'bento/1.0 (https://github.com/belugabox/bento)';
const TIMEOUT_MS = 15_000;

export type SeriesKind = 'manga' | 'comics';

// Modèles présents sur les articles de séries : limitent la recherche.
const INFOBOXES = {
    manga: 'Infobox Animation et bande dessinée asiatiques/Livre',
    mangaHeader: 'Infobox Animation et bande dessinée asiatiques/Entête',
    comics: 'Infobox Bande dessinée',
};

const SYNOPSIS_SECTION = /^(synopsis|résumé|histoire|intrigue|scénario|trame)/i;
// Longueur visée du résumé : une « quatrième de couverture », pas toute
// l'histoire (certains synopsis font plus de 10 000 caractères).
const SUMMARY_MIN_LENGTH = 500;
const SUMMARY_MAX_PARAGRAPHS = 3;

export type SeriesInfobox = {
    genre: string;
    writer: string;
    penciller: string;
    publisher: string;
    volumeCount: number;
    firstYear?: number;
    lastYear?: number;
};

export type WikipediaSeries = SeriesInfobox & {
    id: number;
    title: string;
    url: string;
    summary: string;
    ongoing: boolean;
    coverUrl?: string;
};

const pageUrl = (title: string) =>
    `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

export class Wikipedia {
    constructor(private readonly fetchFn: typeof fetch = fetch) {}

    private get = async <T>(params: Record<string, string>): Promise<T> => {
        const url = new URL(API_URL);
        url.search = new URLSearchParams({
            ...params,
            format: 'json',
            formatversion: '2',
        }).toString();
        let response: Response;
        try {
            response = await this.fetchFn(url, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } catch (error) {
            const reason =
                error instanceof Error ? error.message : String(error);
            throw badGateway(`Wikipédia injoignable : ${reason}`);
        }
        if (response.status === 429) {
            throw badGateway(
                'Wikipédia limite les requêtes : réessaie dans quelques secondes',
            );
        }
        if (!response.ok) {
            throw badGateway(`Wikipédia a répondu ${response.status}`);
        }
        return (await response.json()) as T;
    };

    /**
     * Articles de séries correspondant au texte : mangas et bandes dessinées
     * ensemble, quelle que soit la bibliothèque (une bibliothèque de mangas
     * a aussi ses romans graphiques : « Asterios Polyp », « Le Sculpteur »).
     */
    search = async (text: string) => {
        const data = await this.get<{
            query?: { search: { pageid: number; title: string }[] };
        }>({
            action: 'query',
            list: 'search',
            // « A|B » : l'un ou l'autre modèle.
            srsearch: `${text} hastemplate:"${INFOBOXES.manga}|${INFOBOXES.comics}"`,
            srlimit: '10',
            srprop: '',
        });
        return (data.query?.search ?? []).map((page) => ({
            id: page.pageid,
            title: page.title,
            url: pageUrl(page.title),
        }));
    };

    /** Fiche d'une série : infobox, résumé et image de l'article. */
    series = async (id: number): Promise<WikipediaSeries> => {
        const data = await this.get<{
            query?: {
                pages: {
                    pageid: number;
                    title: string;
                    missing?: boolean;
                    thumbnail?: { source: string };
                }[];
            };
        }>({
            action: 'query',
            pageids: String(id),
            prop: 'pageimages',
            piprop: 'thumbnail',
            pithumbsize: '600',
        });
        const page = data.query?.pages[0];
        if (!page || page.missing) {
            throw notFound(`Série introuvable sur Wikipédia (id ${id})`);
        }

        const [wikitext, sections] = await Promise.all([
            this.parse<{ wikitext: string }>(id, {
                prop: 'wikitext',
                section: '0',
            }),
            this.parse<{ sections: { index: string; line: string }[] }>(id, {
                prop: 'sections',
            }),
        ]);
        const infobox = parseInfobox(wikitext.wikitext);

        // Section « Synopsis » si elle existe, sinon l'introduction.
        const synopsis = sections.sections.find((s) =>
            SYNOPSIS_SECTION.test(cleanText(s.line)),
        );
        const html = await this.parse<{ text: string }>(id, {
            prop: 'text',
            section: synopsis?.index ?? '0',
        });

        return {
            id,
            title: page.title.replace(
                /\s*\((manga|série|bande dessinée)\)$/i,
                '',
            ),
            url: pageUrl(page.title),
            summary: extractSummary(html.text),
            ...infobox,
            // Une seule année : en cours, sauf un volume unique (one-shot,
            // roman graphique), fini dès sa sortie.
            ongoing:
                infobox.firstYear !== undefined &&
                !infobox.lastYear &&
                infobox.volumeCount !== 1,
            coverUrl: page.thumbnail?.source,
        };
    };

    /**
     * Tomes de la série, avec leur année de sortie en France : listés dans
     * l'article, ou dans sa page « Liste des chapitres de… » (parfois
     * découpée en parties, 8 au plus).
     */
    volumes = async (id: number): Promise<SheetVolume[]> => {
        const { wikitext } = await this.parse<{ wikitext: string }>(id, {
            prop: 'wikitext',
        });
        const inline = parseVolumeList(wikitext);
        if (inline.length > 0) return inline;
        const target = volumeListTitle(wikitext);
        if (!target) return [];
        const list = await this.wikitextOf(target);
        const volumes = parseVolumeList(list);
        if (volumes.length > 0) return volumes;
        const parts = [
            ...new Set(
                [
                    ...list.matchAll(
                        new RegExp(
                            `\\[\\[(${escapeRegExp(target)} \\([^)\\]|]*\\))`,
                            'g',
                        ),
                    ),
                ].map((m) => m[1]!),
            ),
        ].slice(0, MAX_LIST_PARTS);
        const all: SheetVolume[] = [];
        for (const part of parts) {
            all.push(...parseVolumeList(await this.wikitextOf(part)));
        }
        return all;
    };

    /** Wikitexte d'une page, par son titre (vide si elle n'existe pas). */
    private wikitextOf = async (title: string) => {
        const data = await this.get<{ parse?: { wikitext: string } }>({
            action: 'parse',
            page: title,
            prop: 'wikitext',
            redirects: '1',
        });
        return data.parse?.wikitext ?? '';
    };

    private parse = async <T>(id: number, params: Record<string, string>) => {
        const data = await this.get<{ parse?: T }>({
            action: 'parse',
            pageid: String(id),
            ...params,
        });
        if (!data.parse) {
            throw notFound(`Série introuvable sur Wikipédia (id ${id})`);
        }
        return data.parse;
    };
}

// --- Extraction (fonctions pures, testées) ---------------------------------

// Parties d'une liste de tomes découpée (One Piece : six).
const MAX_LIST_PARTS = 8;

/** Page de la liste des tomes, d'après l'infobox (« liste_volumes »). */
export const volumeListTitle = (wikitext: string) => {
    const raw = /^\s*\|\s*liste_volumes\s*=(.*)$/m.exec(wikitext)?.[1] ?? '';
    const title = raw
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^\s*\[\[/, '')
        .replace(/(\||\]\])[\s\S]*$/, '')
        .trim();
    return title || undefined;
};

/**
 * Tomes d'une liste en modèles « TomeBD » : numéro et année de sortie en
 * France (la colonne « Français » de l'en-tête, la 2e par défaut).
 */
export const parseVolumeList = (wikitext: string): SheetVolume[] => {
    const header = /\{\{\s*TomeBD\/Ent[êe]te([\s\S]*?)\}\}/.exec(wikitext)?.[1];
    const french = header
        ? ([1, 2, 3].find((n) =>
              new RegExp(`langue_${n}\\s*=\\s*Fran`).test(header),
          ) ?? null)
        : 2;
    const volumes: SheetVolume[] = [];
    for (const block of wikitext.split(/\{\{\s*TomeBD\s*\n/).slice(1)) {
        const param = (name: string) =>
            new RegExp(`^\\s*\\|\\s*${name}\\s*=(.*)$`, 'm').exec(block)?.[1] ??
            '';
        const number = /\d+/.exec(cleanWikitext(param('volume')))?.[0];
        if (number === undefined) continue;
        const date = french ? cleanWikitext(param(`sortie_${french}`)) : '';
        const year = Number(/\b(1[89]\d{2}|20\d{2})\b/.exec(date)?.[1]);
        volumes.push({
            kind: 'volume',
            number: Number(number),
            ...(year && { year }),
        });
    }
    return volumes;
};

/** Texte lisible d'une valeur de wikitexte (liens, modèles, références). */
export const cleanWikitext = (value: string): string => {
    let text = value
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<ref[^>]*\/>/gi, '')
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
        .replace(/<br\s*\/?>/gi, ', ');
    // Modèles, du plus imbriqué au plus externe.
    let previous;
    do {
        previous = text;
        text = text
            .replace(/\{\{\s*date\s*\|([^{}]*)\}\}/gi, (_, args: string) =>
                args
                    .split('|')
                    .filter((arg) => !/^\s*(en|à|au|dans)\b/.test(arg))
                    .join(' '),
            )
            .replace(
                /\{\{\s*(?:lang|langue)\s*\|[^|{}]*\|([^{}]*)\}\}/gi,
                (_, inner: string) => inner.split('|')[0] ?? '',
            )
            .replace(/\{\{[^{}]*\}\}/g, '');
    } while (text !== previous);
    return text
        .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
        .replace(/\[\[([^\]]*)\]\]/g, '$1')
        .replace(/'{2,}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const infoboxBlock = (wikitext: string, template: string): string => {
    const start = wikitext.indexOf(`{{${template}`);
    if (start < 0) return '';
    const rest = wikitext.slice(start + template.length + 2);
    const end = rest.search(/\n\s*\}\}/);
    return end < 0 ? rest : rest.slice(0, end);
};

const escapeRegExp = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const infoboxParam = (block: string, name: string): string => {
    const match = new RegExp(
        `^\\s*\\|\\s*${escapeRegExp(name)}\\s*=(.*)$`,
        'm',
    ).exec(block);
    return match ? cleanWikitext(match[1]!) : '';
};

const yearsOf = (value: string): number[] =>
    [...value.matchAll(/\b(1[89]\d{2}|20\d{2})\b/g)].map((m) => Number(m[1]));

const capitalize = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Genre, auteurs, éditeur, nombre de tomes et années de parution depuis
 * l'infobox de l'article (manga ou bande dessinée).
 */
export const parseInfobox = (wikitext: string): SeriesInfobox => {
    const manga = infoboxBlock(wikitext, INFOBOXES.manga);
    if (manga) {
        const header = infoboxBlock(wikitext, INFOBOXES.mangaHeader);
        const author = infoboxParam(manga, 'auteur');
        return {
            genre: capitalize(infoboxParam(header, 'genre')),
            writer: infoboxParam(manga, 'scénariste') || author,
            penciller: infoboxParam(manga, 'dessinateur') || author,
            publisher: infoboxParam(manga, 'éditeur_francophone'),
            volumeCount: parseInt(infoboxParam(manga, 'nb_volumes'), 10) || 0,
            firstYear: yearsOf(infoboxParam(manga, 'premier_volume'))[0],
            lastYear: yearsOf(infoboxParam(manga, 'dernier_volume'))[0],
        };
    }
    const comics = infoboxBlock(wikitext, INFOBOXES.comics);
    // « 2000-2021 », ou « 2019 » pour une série en cours.
    const years = yearsOf(infoboxParam(comics, 'première publication'));
    const author = infoboxParam(comics, 'auteur');
    return {
        genre: capitalize(infoboxParam(comics, 'genre')),
        writer: infoboxParam(comics, 'scénario') || author,
        penciller: infoboxParam(comics, 'dessin') || author,
        publisher: infoboxParam(comics, 'éditeur'),
        volumeCount: parseInt(infoboxParam(comics, "nombre d'albums"), 10) || 0,
        firstYear: years[0],
        lastYear: years.length > 1 ? years.at(-1) : undefined,
    };
};

/** Texte d'un intitulé ou d'un paragraphe : sans balises ni transcriptions. */
const cleanText = (text: string): string =>
    text
        .replace(/<[^>]+>/g, '')
        .replace(/ /g, ' ')
        // Transcriptions japonaises entre parenthèses : « Ostania (東国, Osutania?) ».
        .replace(/\s*\([^()]*[぀-ヿ㐀-鿿][^()]*\)/g, '')
        .replace(/\s+([,.])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

/** Premiers paragraphes d'une section rendue en HTML. */
export const extractSummary = (html: string): string => {
    const $ = cheerioLoad(html);
    $('sup, style, table, .mw-editsection, .infobox, .bandeau').remove();
    const paragraphs: string[] = [];
    let length = 0;
    for (const element of $('p').toArray()) {
        if (
            length >= SUMMARY_MIN_LENGTH ||
            paragraphs.length >= SUMMARY_MAX_PARAGRAPHS
        ) {
            break;
        }
        const text = cleanText($(element).text());
        if (text) {
            paragraphs.push(text);
            length += text.length;
        }
    }
    return paragraphs.join('\n\n');
};
