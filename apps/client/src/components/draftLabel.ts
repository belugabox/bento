/** Nom montré d'un brouillon (dossier sans `_draft/`). */
export const draftLabel = (folder: string) =>
    folder === '_draft'
        ? '(racine de _draft)'
        : folder.replace(/^_draft\//, '');
