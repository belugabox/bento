import AdmZip from 'adm-zip';
import { readFile, writeFile } from 'node:fs/promises';

import { type ComicInfo, readComicInfo } from './comicInfo';
import {
    UnsupportedZipError,
    appendEntry,
    descriptorsLost,
    readZipEntries,
    readZipEntry,
} from './zipIndex';

// Ordre des champs dans ComicInfo.xml (schéma Anansi).
export const COMIC_INFO_FIELDS: (keyof ComicInfo)[] = [
    'Title',
    'Series',
    'Number',
    'Count',
    'Volume',
    'AlternateSeries',
    'AlternateNumber',
    'AlternateCount',
    'Summary',
    'Notes',
    'Year',
    'Month',
    'Day',
    'Writer',
    'Penciller',
    'Inker',
    'Colorist',
    'Letterer',
    'CoverArtist',
    'Editor',
    'Publisher',
    'Imprint',
    'Genre',
    'Tags',
    'Web',
    'PageCount',
    'LanguageISO',
    'Format',
    'BlackAndWhite',
    'Manga',
    'Characters',
    'Teams',
    'Locations',
    'ScanInformation',
    'StoryArc',
    'SeriesGroup',
    'AgeRating',
    'CommunityRating',
    'MainCharacterOrTeam',
    'Review',
];

export const escapeXml = (str: string): string =>
    str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

export const buildComicInfoXml = (comicInfo: ComicInfo): Buffer => {
    let xml = '<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo>\n';
    for (const field of COMIC_INFO_FIELDS) {
        const value = comicInfo[field];
        if (value === undefined || value === '') continue;
        xml += `  <${field}>${escapeXml(String(value))}</${field}>\n`;
    }
    xml += '</ComicInfo>';
    return Buffer.from(xml, 'utf-8');
};

/** Bit 3 des flags : CRC et tailles dans un descripteur après les données. */
const FLAG_DATA_DESCRIPTOR = 0x08;

/**
 * Une archive créée « en flux » marque ses entrées du bit 3, suivies d'un
 * descripteur. AdmZip recopie ces entrées en gardant le bit mais sans le
 * descripteur, puis refuse de les relire (« No descriptor present »). Il
 * écrit de toute façon le CRC et les tailles dans l'en-tête local : le bit
 * peut être retiré.
 */
export const clearDescriptorFlags = (zip: AdmZip) => {
    for (const entry of zip.getEntries()) {
        entry.header.flags &= ~FLAG_DATA_DESCRIPTOR;
    }
};

/** Message d'AdmZip sur une archive touchée (voir `clearDescriptorFlags`). */
export const isMissingDescriptorError = (error: unknown) =>
    error instanceof Error && error.message.includes('No descriptor present');

/**
 * Écrit l'archive sur disque. `zip.writeZip` fait ensuite un `chmod 0666`
 * qui échoue (EPERM) quand le fichier appartient à un autre utilisateur,
 * cas courant sur un volume Docker : on écrit le contenu nous-mêmes, ce qui
 * garde aussi le propriétaire et les droits du fichier.
 *
 * `toBuffer` est volontairement synchrone : la version asynchrone
 * (`toBufferPromise`) lève ses erreurs depuis un callback, hors de la
 * promesse, ce qui arrête le processus Node.
 */
export const writeZipFile = async (zip: AdmZip, fullPath: string) => {
    clearDescriptorFlags(zip);
    await writeFile(fullPath, zip.toBuffer());
};

/** Réécrit une archive touchée par la perte des descripteurs. */
export const repairDescriptorFlags = async (fullPath: string) =>
    writeZipFile(new AdmZip(await readFile(fullPath)), fullPath);

/** ComicInfo modifié : un champ `null` ou vide est retiré. */
const mergeChanges = (
    current: ComicInfo,
    changes: { [K in keyof ComicInfo]?: ComicInfo[K] | null },
): ComicInfo => {
    const merged: Record<string, unknown> = { ...current };
    for (const [field, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === '') {
            delete merged[field];
        } else {
            merged[field] = value;
        }
    }
    return merged as ComicInfo;
};

/**
 * Modifie le ComicInfo d'une archive : les champs donnés remplacent les
 * existants, un champ `null` ou vide est retiré. Renvoie le ComicInfo final.
 *
 * Le nouveau ComicInfo est ajouté en fin d'archive (`appendEntry`), sans
 * recopier les pages : quelques millisecondes, même pour un tome de 1 Go.
 * Une archive Zip64 ou abîmée passe par AdmZip, qui la réécrit en entier.
 */
export const updateComicInfo = async (
    fullPath: string,
    changes: { [K in keyof ComicInfo]?: ComicInfo[K] | null },
): Promise<ComicInfo> => {
    const entries = await readZipEntries(fullPath).catch(() => undefined);
    if (
        entries &&
        !(await descriptorsLost(fullPath, entries).catch(() => true))
    ) {
        const comicInfo = mergeChanges(
            await readComicInfo(
                entries.map((entry) => ({
                    entryName: entry.entryName,
                    getData: () => readZipEntry(fullPath, entry),
                })),
            ),
            changes,
        );
        try {
            await appendEntry(
                fullPath,
                'ComicInfo.xml',
                buildComicInfoXml(comicInfo),
            );
            return comicInfo;
        } catch (error) {
            if (!(error instanceof UnsupportedZipError)) throw error;
        }
    }
    return rewriteComicInfo(fullPath, changes);
};

/** Réécrit toute l'archive avec AdmZip (voir `updateComicInfo`). */
const rewriteComicInfo = async (
    fullPath: string,
    changes: { [K in keyof ComicInfo]?: ComicInfo[K] | null },
): Promise<ComicInfo> => {
    // Lu sans bloquer : AdmZip lirait le fichier en synchrone.
    const zip = new AdmZip(await readFile(fullPath));
    const comicInfo = mergeChanges(
        await readComicInfo(zip.getEntries()),
        changes,
    );

    // Remplacer l'ancienne entrée, quelle que soit la casse de son nom.
    for (const entry of zip.getEntries()) {
        if (entry.entryName.toLowerCase() === 'comicinfo.xml') {
            zip.deleteFile(entry.entryName);
        }
    }
    zip.addFile('ComicInfo.xml', buildComicInfoXml(comicInfo));
    await writeZipFile(zip, fullPath);
    return comicInfo;
};
