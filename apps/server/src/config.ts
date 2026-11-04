import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    // Base SQLite, cache des images… (volume `/config` dans Docker).
    DATA_PATH: z.string().default('./data'),
});

export type Config = z.infer<typeof schema> & { DB_FILE: string };

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
    };
};
