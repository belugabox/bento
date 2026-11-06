/** Ce que la complétude d'une série regarde. */
export type CompletenessInput = {
    name?: string | null;
    hasFormat: boolean;
    hasAge: boolean;
    hasStatus: boolean;
    genreCount: number;
    writer?: string | null;
    penciller?: string | null;
    publisher?: string | null;
    summary?: string | null;
    volumes: { number?: string | null; year?: number | null }[];
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
    ];
    const total = input.volumes.length;
    const withNumber = input.volumes.filter((v) => filled(v.number)).length;
    const withYear = input.volumes.filter((v) => !!v.year).length;
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
