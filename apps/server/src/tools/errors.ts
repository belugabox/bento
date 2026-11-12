import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodError } from 'zod';

/**
 * Erreur métier attendue : son message est destiné à l'utilisateur et renvoyé
 * tel quel avec `status`. Toute autre erreur est traitée comme interne (500
 * générique, détail uniquement dans les logs).
 */
export class AppError extends Error {
    constructor(
        readonly status: ContentfulStatusCode,
        message: string,
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export const badRequest = (message: string) => new AppError(400, message);
export const unauthorized = (message: string) => new AppError(401, message);
export const forbidden = (message: string) => new AppError(403, message);
export const notFound = (message: string) => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);
export const tooManyRequests = (message: string) => new AppError(429, message);
// Requête valide, mais certaines données n'ont pas pu être traitées.
export const unprocessable = (message: string) => new AppError(422, message);
// Service externe (Manga-news…) en erreur ou injoignable.
export const badGateway = (message: string) => new AppError(502, message);

/**
 * Un site refuse nos requêtes (contrôle anti-robot, trop de requêtes) : la
 * mise à jour en arrière-plan s'arrête aussitôt, sans insister.
 */
export class RefusedError extends AppError {
    constructor(message: string) {
        super(502, message);
        this.name = 'RefusedError';
    }
}
export const refused = (message: string) => new RefusedError(message);

/** Message lisible pour une erreur de validation zod (1re erreur seulement). */
export const formatZodError = (error: ZodError): string => {
    const issue = error.issues[0];
    if (!issue) return 'Requête invalide';
    const field = issue.path.join('.');
    const prefix = field ? `Champ « ${field} » : ` : '';
    switch (issue.code) {
        case 'invalid_type':
            return issue.received === 'undefined'
                ? `${prefix}requis`
                : `${prefix}type invalide`;
        case 'too_small':
            return issue.type === 'string'
                ? `${prefix}${issue.minimum} caractère(s) minimum`
                : issue.type === 'array'
                  ? `${prefix}${issue.minimum} élément(s) minimum`
                  : `${prefix}doit être ≥ ${issue.minimum}`;
        case 'invalid_enum_value':
            return `${prefix}valeur invalide (${issue.options.join(', ')})`;
        default:
            // `custom` et autres : le message porte déjà l'explication.
            return `${prefix}${issue.message}`;
    }
};
