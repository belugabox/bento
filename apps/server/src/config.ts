import path from 'node:path';
import { z } from 'zod';

const librarySchema = z.object({
    name: z.string().min(1),
    path: z.string().min(1),
    type: z.enum(['manga', 'comics']),
});

export type LibraryConfig = z.infer<typeof librarySchema>;

// `LIBRARIES` : tableau JSON, ex. [{"name":"Mangas","path":"/manga","type":"manga"}].
const librariesSchema = z
    .string()
    .default('[]')
    .transform((value, ctx) => {
        try {
            return JSON.parse(value) as unknown;
        } catch {
            ctx.addIssue({ code: 'custom', message: 'JSON invalide' });
            return z.NEVER;
        }
    })
    .pipe(z.array(librarySchema));

const schema = z.object({
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    // Base SQLite, cache des images… (volume `/config` dans Docker).
    DATA_PATH: z.string().default('./data'),
    LIBRARIES: librariesSchema,
    // Intervalle entre deux scans automatiques (0 = jamais), une semaine au
    // plus comme dans les réglages.
    SCAN_INTERVAL_MINUTES: z.coerce
        .number()
        .int()
        .min(0)
        .max(7 * 24 * 60)
        .default(30),
    // Connexion OIDC (Pocket ID).
    OIDC_ISSUER: z.string().url(),
    OIDC_CLIENT_ID: z.string().min(1),
    OIDC_CLIENT_SECRET: z.string().min(1),
    OIDC_ADMIN_GROUP: z.string().min(1).default('bento-admins'),
    OIDC_READER_GROUP: z.string().min(1).default('bento-readers'),
    // Adresse publique de l'appli, sans « / » final.
    PUBLIC_URL: z
        .string()
        .url()
        .transform((url) => url.replace(/\/+$/, '')),
});

export type Config = z.infer<typeof schema> & {
    DB_FILE: string;
    COVERS_PATH: string;
};

/** Configuration lue dans l'environnement ; arrête tout si elle est invalide. */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
    const result = schema.safeParse(env);
    if (!result.success) {
        const issues = result.error.issues
            .map((issue) => `${issue.path.join('.')} : ${issue.message}`)
            .join(', ');
        throw new Error(`Configuration invalide : ${issues}`);
    }
    const dataPath = path.resolve(result.data.DATA_PATH);
    return {
        ...result.data,
        DATA_PATH: dataPath,
        DB_FILE: path.join(dataPath, 'bento.db'),
        COVERS_PATH: path.join(dataPath, 'covers'),
        LIBRARIES: result.data.LIBRARIES.map((library) => ({
            ...library,
            path: path.resolve(library.path),
        })),
    };
};
