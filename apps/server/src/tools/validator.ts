import { zValidator as zv } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodSchema } from 'zod';

import { badRequest, formatZodError } from './errors';

/**
 * `zValidator` dont les échecs deviennent une `AppError` 400 au message
 * lisible (au lieu de l'objet ZodError brut). Même signature et mêmes types
 * que l'original : le client RPC n'est pas impacté.
 */
export const zValidator = <
    T extends ZodSchema,
    Target extends keyof ValidationTargets,
>(
    target: Target,
    schema: T,
) =>
    zv(target, schema, (result) => {
        if (!result.success) throw badRequest(formatZodError(result.error));
    });
