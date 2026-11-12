import { type ComicInfo, isStandalone, volumeNumbering } from '@server/types';

/** Ce que la complétude d'une série regarde. */
export type CompletenessInput = {
    name?: string | null;
    hasFormat: boolean;
    hasAge: boolean;
    hasStatus: boolean;
    /** Une note des lecteurs relevée sur une fiche en ligne. */
    hasRating: boolean;
    genreCount: number;
    writer?: string | null;
    penciller?: string | null;
    publisher?: string | null;
    summary?: string | null;
    /**
     * Les tomes (un one-shot, une intégrale sans numéro : `standalone`, sans
     * numéro à donner), ou seulement leurs comptes (gestion des séries).
     */
    volumes:
        | {
              number?: string | null;
              year?: number | null;
              standalone?: boolean;
          }[]
        | VolumeCounts;
};

/** Tomes d'une série : combien, et combien ont un numéro ou une année. */
export type VolumeCounts = {
    total: number;
    withNumber: number;
    withYear: number;
};

export type Completeness = {
    /** Part des informations remplies, de 0 à 100. */
    percent: number;
    /** Ce qui manque, lisible (« Résumé », « Année de 3 tomes »). */
    missing: string[];
};

const filled = (value: string | null | undefined) => !!value?.trim();

const tomes = (count: number) => `${count} tome${count > 1 ? 's' : ''}`;

/**
 * Complétude d'une série : chaque information de série compte pour un,
 * le numéro et l'année des tomes aussi (au prorata des tomes renseignés).
 */
export const completenessOf = (input: CompletenessInput): Completeness => {
    const fields: [string, boolean][] = [
        ['Nom', filled(input.name)],
        ['Format', input.hasFormat],
        ['Âge', input.hasAge],
        ['Statut', input.hasStatus],
        ['Genres', input.genreCount > 0],
        ['Scénario', filled(input.writer)],
        ['Dessin', filled(input.penciller)],
        ['Éditeur', filled(input.publisher)],
        ['Résumé', filled(input.summary)],
        ['Note', input.hasRating],
    ];
    const { total, withNumber, withYear } = Array.isArray(input.volumes)
        ? {
              total: input.volumes.length,
              withNumber: input.volumes.filter(
                  (v) => v.standalone || filled(v.number),
              ).length,
              withYear: input.volumes.filter((v) => !!v.year).length,
          }
        : input.volumes;
    const parts = [
        ...fields.map(([, done]) => (done ? 1 : 0)),
        total ? withNumber / total : 1,
        total ? withYear / total : 1,
    ];
    const missing = [
        ...fields.filter(([, done]) => !done).map(([label]) => label),
        ...(withNumber < total
            ? [`Numéro de ${tomes(total - withNumber)}`]
            : []),
        ...(withYear < total ? [`Année de ${tomes(total - withYear)}`] : []),
    ];
    const sum = parts.reduce((a, b) => a + b, 0);
    // Arrondi vers le bas : 100 % seulement si tout est rempli.
    return { percent: Math.floor((sum / parts.length) * 100), missing };
};

/** Première valeur remplie d'un champ, dans l'ordre des tomes. */
const firstFilled = (infos: ComicInfo[], field: keyof ComicInfo) => {
    const value = infos
        .map((info) => info[field])
        .find((v) => v !== undefined && v !== null && String(v).trim() !== '');
    return value === undefined ? undefined : String(value);
};

/**
 * Champs d'une série lus dans les ComicInfo de ses tomes, comme l'éditeur
 * les montre : la première valeur remplie de chaque champ, le résumé du
 * premier tome. La fiche série et l'éditeur passent par là : même
 * pourcentage des deux côtés.
 */
export const fieldsFromVolumes = (infos: ComicInfo[]) => ({
    name: firstFilled(infos, 'Series'),
    writer: firstFilled(infos, 'Writer'),
    penciller: firstFilled(infos, 'Penciller'),
    publisher: firstFilled(infos, 'Publisher'),
    summary: infos[0]?.Summary,
    volumes: infos.map((info) => {
        const { kind, number } = volumeNumbering(info);
        return {
            number,
            year: info.Year,
            standalone: isStandalone({ kind, number }),
        };
    }),
});
