import 'dotenv/config';

import { adminLink } from './auth/links';
import { loadConfig } from './config';
import { openDatabase } from './db';

/**
 * Secours : lien pour choisir un nouveau mot de passe d'admin.
 * `node dist/adminLink.js [identifiant]` (le premier admin par défaut).
 */
const config = loadConfig();
const database = openDatabase(config.DB_FILE);
try {
    const link = adminLink(database.db, process.argv[2]);
    if (!link) {
        console.error('Aucun admin avec cet identifiant.');
        process.exitCode = 1;
    } else {
        console.log(
            `Lien pour ${link.name} (valable 7 jours, une seule fois) :\n${config.PUBLIC_URL}/join/${link.token}`,
        );
    }
} finally {
    database.close();
}
