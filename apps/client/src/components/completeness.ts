export {
    type Completeness,
    type CompletenessInput,
    type VolumeCounts,
    completenessOf,
    fieldsFromVolumes,
} from '@server/types';

/** Comment remplir ce qui manque (« Résumé », « Année de 3 tomes »…). */
export const missingHint = (item: string) =>
    /^Format|^Âge|^Statut/.test(item)
        ? 'À choisir dans l’éditeur.'
        : /^Note/.test(item)
          ? 'Relevée sur Manga-news ou Bedetheque par « Remplir » ou « Mettre à jour ».'
          : /^Parution/.test(item)
            ? 'Avec « Remplir » (Wikipédia, Manga-news), ou à saisir : « 2019 », « 2000 – 2013 ».'
            : /^Numéro/.test(item)
              ? 'Dans l’éditeur, ou lu dans les noms de fichiers (« T01 », « #01 »).'
              : /^Année/.test(item)
                ? 'Dans l’éditeur, ou lue dans les noms de fichiers (« (2021) »).'
                : 'À saisir, ou avec « Remplir » depuis une fiche en ligne.';
