import { z } from 'zod';

import { ACCENTS, COLOR_SCHEMES } from './appearance';
import { DEFAULT_AGE_STEPS } from './classification';
import type { Db } from './db';
import { settings as settingsTable } from './db/schema';
import {
    DEFAULT_SOURCE_PRIORITY,
    METADATA_SOURCES,
    SHEET_FIELDS,
    type SheetField,
} from './metadata/sourceLink';

const ageStepsSchema = z
    .array(z.number().int().min(0).max(21))
    .min(1)
    .max(22)
    .transform((ages) => [...new Set(ages)].sort((a, b) => a - b));

// Site préféré pour chaque champ d'une fiche de série.
const siteSchema = z.enum(METADATA_SOURCES);
const sourcePrioritySchema = z.object(
    Object.fromEntries(
        SHEET_FIELDS.map((field) => [field, siteSchema]),
    ) as unknown as Record<SheetField, typeof siteSchema>,
);

const appearanceSchema = z.object({
    // Mode et couleur de l'appli tant que l'appareil n'a pas les siens.
    colorScheme: z.enum(COLOR_SCHEMES),
    accent: z.enum(ACCENTS),
});

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
    appearance: appearanceSchema,
    // Grille d'âges proposée pour les séries et les comptes (0 : tout public).
    ages: ageStepsSchema,
    sourcePriority: sourcePrioritySchema,
    // « Lu par » d'une fiche série : à partir de cette part des pages lues.
    readByPercent: z.number().int().min(1).max(100),
});

export type Settings = z.infer<typeof settingsSchema>;

/** Modification partielle : seuls les champs donnés changent. */
export const settingsUpdateSchema = z.object({
    compression: settingsSchema.shape.compression.partial().optional(),
    scanIntervalMinutes: settingsSchema.shape.scanIntervalMinutes.optional(),
    appearance: appearanceSchema.partial().optional(),
    ages: ageStepsSchema.optional(),
    sourcePriority: sourcePrioritySchema.partial().optional(),
    readByPercent: settingsSchema.shape.readByPercent.optional(),
});

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export const defaultSettings = (scanIntervalMinutes = 30): Settings => ({
    compression: { quality: 90, maxHeight: 2400 },
    scanIntervalMinutes,
    appearance: { colorScheme: 'auto', accent: 'violet' },
    ages: DEFAULT_AGE_STEPS,
    sourcePriority: DEFAULT_SOURCE_PRIORITY,
    readByPercent: 10,
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
            appearance: {
                ...this.defaults.appearance,
                ...saved.appearance,
            },
            sourcePriority: {
                ...this.defaults.sourcePriority,
                ...saved.sourcePriority,
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
            appearance: { ...current.appearance, ...changes.appearance },
            sourcePriority: {
                ...current.sourcePriority,
                ...changes.sourcePriority,
            },
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
