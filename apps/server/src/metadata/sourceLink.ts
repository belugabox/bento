/**
 * Fiches en ligne choisies pour une série (Manga-news, Wikipédia,
 * Bedetheque), gardées pour la mettre à jour sans refaire de recherche.
 * Sans Node : partagé avec le client.
 */
export const METADATA_SOURCES = [
    'manga-news',
    'wikipedia',
    'bedetheque',
] as const;
export type MetadataSource = (typeof METADATA_SOURCES)[number];

/** Une fiche : son site et son identifiant. */
export type SourceLink = { site: MetadataSource; id: string };

export const SOURCE_LABELS: Record<MetadataSource, string> = {
    'manga-news': 'Manga-news',
    wikipedia: 'Wikipédia',
    bedetheque: 'Bedetheque',
};

/**
 * Identifiant valide : fin de l'adresse de la fiche Manga-news
 * (« Dr-Stone »), numéro de la page Wikipédia ou de la série Bedetheque.
 */
export const isSourceId = ({ site, id }: SourceLink) =>
    site === 'manga-news'
        ? /^[^/?#\\\s]{1,200}$/.test(id)
        : /^\d{1,12}$/.test(id);

/**
 * Fiches d'une série, enregistrées en texte : une par site, séparées par
 * une espace (« manga-news:Dr-Stone wikipedia:123456 »).
 */
export const parseSources = (text: string | null | undefined): SourceLink[] =>
    (text ?? '').split(' ').flatMap((item) => {
        const at = item.indexOf(':');
        const link = {
            site: item.slice(0, at) as MetadataSource,
            id: item.slice(at + 1),
        };
        return at > 0 &&
            METADATA_SOURCES.includes(link.site) &&
            isSourceId(link)
            ? [link]
            : [];
    });

/** Texte enregistré (null sans fiche), une fiche par site. */
export const sourcesText = (links: SourceLink[]) => {
    const bySite = new Map(links.map((link) => [link.site, link.id]));
    const text = METADATA_SOURCES.filter((site) => bySite.has(site))
        .map((site) => `${site}:${bySite.get(site)}`)
        .join(' ');
    return text || null;
};

export const mangaNewsSeriesUrl = (id: string) =>
    `https://www.manga-news.com/index.php/serie/${encodeURIComponent(id).replace(/%3A/gi, ':')}`;

/** Fiche d'une série sur Bedetheque (le site la redirige vers son nom). */
export const bedethequeSeriesUrl = (id: string) =>
    `https://www.bedetheque.com/serie_${id}.html`;

/** Adresse de la fiche, à ouvrir dans le navigateur. */
export const sourceUrl = ({ site, id }: SourceLink) =>
    site === 'manga-news'
        ? mangaNewsSeriesUrl(id)
        : site === 'bedetheque'
          ? bedethequeSeriesUrl(id)
          : `https://fr.wikipedia.org/?curid=${id}`;

/**
 * Note des lecteurs d'une série, ramenée sur 5 (comme `CommunityRating` du
 * ComicInfo), et le nombre d'avis ou de votes.
 */
export type SeriesRating = { value: number; count: number };

/** Note sur `best` ramenée sur 5, à un chiffre après la virgule. */
export const ratingOutOf5 = (value: number, best: number) =>
    Math.round((value / best) * 5 * 10) / 10;

/** Champs d'une fiche de série, comparés aux fiches en ligne, dans l'ordre. */
export const SHEET_FIELDS = [
    'Series',
    'Format',
    'Age',
    'Status',
    'Genre',
    'Tags',
    'Writer',
    'Penciller',
    'Publisher',
    'Summary',
] as const;

export type SheetField = (typeof SHEET_FIELDS)[number];

export const SHEET_FIELD_LABELS: Record<SheetField, string> = {
    Series: 'Nom',
    Format: 'Format',
    Age: 'Âge',
    Status: 'Statut',
    Genre: 'Genres',
    Tags: 'Thèmes',
    Writer: 'Scénario',
    Penciller: 'Dessin',
    Publisher: 'Éditeur',
    Summary: 'Résumé',
};

/**
 * Site préféré pour chaque champ (réglages) : sa valeur est proposée quand
 * le champ est vide et que les deux fiches en donnent une.
 */
export type SourcePriority = Record<SheetField, MetadataSource>;

export const DEFAULT_SOURCE_PRIORITY: SourcePriority = Object.fromEntries(
    SHEET_FIELDS.map((field) => [field, 'manga-news']),
) as SourcePriority;
