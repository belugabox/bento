import { z } from 'zod';

import type { Db } from './db';
import { settings as settingsTable } from './db/schema';

export const settingsSchema = z.object({
    compression: z.object({
        // Qualité JPEG des pages recompressées.
        quality: z.number().int().min(40).max(100),
        // Hauteur maximale des pages, en pixels ; null = taille gardée.
        maxHeight: z.number().int().min(800).max(10_000).nullable(),
    }),
    // Intervalle entre deux scans automatiques (0 = jamais).
    scanIntervalMinutes: z
        .number()
        .int()
        .min(0)
        .max(7 * 24 * 60),
});

export type Settings = z.infer<typeof settingsSchema>;

/** Modification partielle : seuls les champs donnés changent. */
export const settingsUpdateSchema = z.object({
    compression: settingsSchema.shape.compression.partial().optional(),
    scanIntervalMinutes: settingsSchema.shape.scanIntervalMinutes.optional(),
});

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export const defaultSettings = (scanIntervalMinutes = 30): Settings => ({
    compression: { quality: 90, maxHeight: 2400 },
    scanIntervalMinutes,
});

const KEY = 'settings';

/**
 * Réglages de l'admin, gardés en base. Les valeurs absentes ou invalides
 * (ancienne version) reprennent leur valeur par défaut.
 */
export class SettingsStore {
    private listeners: ((settings: Settings) => void)[] = [];

    constructor(
        private readonly db: Db,
        readonly defaults: Settings = defaultSettings(),
    ) {}

    get = (): Settings => {
        const row = this.db.select().from(settingsTable).get();
        const saved = (row?.value ?? {}) as Partial<Settings>;
        const merged = {
            ...this.defaults,
            ...saved,
            compression: {
                ...this.defaults.compression,
                ...saved.compression,
            },
        };
        const parsed = settingsSchema.safeParse(merged);
        return parsed.success ? parsed.data : this.defaults;
    };

    update = (changes: SettingsUpdate): Settings => {
        const current = this.get();
        const next = settingsSchema.parse({
            ...current,
            ...changes,
            compression: { ...current.compression, ...changes.compression },
        });
        this.db
            .insert(settingsTable)
            .values({ key: KEY, value: next })
            .onConflictDoUpdate({
                target: settingsTable.key,
                set: { value: next },
            })
            .run();
        for (const listener of this.listeners) listener(next);
        return next;
    };

    /** Appelé à chaque modification (par ex. pour relancer le scan). */
    onChange = (listener: (settings: Settings) => void) => {
        this.listeners.push(listener);
    };
}
