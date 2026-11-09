// Règles des comptes, partagées avec le client (sans Node).

/** Identifiant : lettres (accents compris), chiffres, point, tiret, soulignement. */
export const USERNAME_PATTERN = /^[\p{L}\p{N}._-]{2,32}$/u;

export const USERNAME_RULE =
    'De 2 à 32 caractères : lettres, chiffres, point, tiret ou soulignement';

export const PASSWORD_MIN_LENGTH = 8;

/** Graine d'avatar valable : courte, lisible dans une adresse. */
export const isAvatarSeed = (seed: string) =>
    /^[A-Za-z0-9_-]{1,64}$/.test(seed);

/** Page interne où revenir après la connexion ; tout le reste mène à l'accueil. */
export const safeRedirect = (value: string | null | undefined) =>
    value &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\') &&
    !value.startsWith('/api/')
        ? value
        : '/';
