import path from 'node:path';

/**
 * Nom de série deviné d'un dossier ou d'un fichier de brouillons, sans son
 * numéro ni ce qui l'entoure : « Gantz T01 [Team] » → « Gantz »,
 * « One.Piece.Vol.12 » → « One Piece », « Spirale.cbz » → « Spirale ».
 * Pour reconnaître des dossiers reçus un par tome (fusion des brouillons).
 */
export const guessSeriesName = (folderOrFile: string) => {
    let name = path.posix
        .basename(folderOrFile)
        .replace(/\.(cb[rz]|pdf)$/i, '');
    // Équipe, année, qualité : entre crochets ou parenthèses.
    name = name.replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ');
    name = name.replace(/[._]+/g, ' ');
    // Le numéro du tome, et ce qui le suit (« T01 - Titre »).
    name = name.replace(
        /(?:^|[\s-])(?:t|tome|tomes|vol|volume|v|#|n°)\s*\d+.*$/i,
        '',
    );
    // Un numéro seul à la fin (« Gantz 03 »).
    name = name.replace(/\s+\d+(?:\s*-\s*\d+)?\s*$/, '');
    return name
        .replace(/\s+/g, ' ')
        .replace(/[\s\-–:,]+$/, '')
        .trim();
};

/** Nom utilisable comme dossier (sans les caractères interdits). */
export const safeFolderName = (name: string) =>
    name
        .replace(/[<>:"/\\|?*]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/, '')
        .trim();
