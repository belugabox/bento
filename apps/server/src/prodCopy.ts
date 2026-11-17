import path from 'node:path';

/**
 * Parcourir une copie de la prod, sans ses fichiers (`pnpm prod-copy`) :
 * le serveur sur `http://127.0.0.1:3200`, données dans `O:/PERSO/bento-prod`
 * (à côté du dépôt ; `PROD_COPY_PATH` pour un autre dossier), bibliothèques
 * hors ligne (ni scan ni mise à jour des fiches, voir README). Variables
 * posées avant `main` : celles du `.env` de développement ne s'appliquent
 * pas (dotenv ne remplace pas une variable déjà définie).
 */
const port = process.env.PROD_COPY_PORT ?? '3200';
process.env.PORT = port;
process.env.DATA_PATH =
    process.env.PROD_COPY_PATH ??
    // dist → server → apps → dépôt → dossier voisin.
    path.resolve(__dirname, '..', '..', '..', '..', 'bento-prod');
process.env.LIBRARIES = '[]';
process.env.LIBRARIES_OFFLINE = '1';
// 127.0.0.1 et pas localhost : le cookie de session du serveur de
// développement (localhost) n'est pas touché.
process.env.PUBLIC_URL = `http://127.0.0.1:${port}`;

void import('./main');
