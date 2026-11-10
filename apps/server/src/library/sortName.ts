// Articles ignorés pour le tri (« Le Petit Prince » est rangé à P). Le nom
// affiché, lui, ne change pas.
const ARTICLES = 'le|la|les|un|une|des|the|an?';
const LEADING_ARTICLE = new RegExp(
    `^(?:(?:${ARTICLES})\\s+|l['’]\\s*)(?=\\S)`,
    'i',
);
// Article rejeté en fin de nom, à la façon des bibliothèques :
// « Boxer (The) », « Attaque des Titans (L') ».
const TRAILING_ARTICLE = new RegExp(
    `^(.+?)\\s*[(,]\\s*(${ARTICLES}|l['’])\\s*\\)?$`,
    'i',
);

/** Article remis devant le nom : « Boxer (The) » devient « The Boxer ». */
export const articleFirst = (name: string) => {
    const match = TRAILING_ARTICLE.exec(name.trim());
    if (!match) return name.trim();
    const [, rest, found] = match as unknown as [string, string, string];
    // En tête du nom : avec une majuscule (« Sculpteur (le) », « Le Sculpteur »).
    const article = found.charAt(0).toUpperCase() + found.slice(1);
    return /['’]$/.test(article) ? `${article}${rest}` : `${article} ${rest}`;
};

/** Clé de tri d'un nom de série : sans article. */
export const sortKeyOf = (name: string) =>
    articleFirst(name).replace(LEADING_ARTICLE, '');

// Comparateurs créés une fois : `localeCompare` avec options en recrée un à
// chaque appel (10 à 50 ms pour trier quelques centaines de séries).
const BY_KEY = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
const BY_NAME = new Intl.Collator('fr');

/** Ordre alphabétique des séries (articles ignorés, numéros dans l'ordre). */
export const compareNames = (a: string, b: string) =>
    BY_KEY.compare(sortKeyOf(a), sortKeyOf(b)) || BY_NAME.compare(a, b);
