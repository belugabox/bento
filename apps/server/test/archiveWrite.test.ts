import AdmZip from 'adm-zip';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openArchive } from '../src/archive/archive';
import { convertCbrToCbz, isCbr, isRarArchive } from '../src/archive/cbr';
import { readComicInfo } from '../src/archive/comicInfo';
import { buildComicInfoXml, updateComicInfo } from '../src/archive/write';

// Archive créée « en flux » (Python, sortie non positionnable) : chaque
// entrée a le bit 3 et un descripteur après ses données.
const STREAMED_ZIP = Buffer.from(
    'UEsDBBQACAAIABZKY10AAAAAAAAAAAAAAAALAAAAcGFnZTAwMS5qcGfLzE1MTzUEAFBLBwjWns14CAAAAAYAAABQSwMEFAAIAAgAFkpjXQAAAAAAAAAAAAAAAAsAAABwYWdlMDAyLmpwZ8vMTUxPNQIAUEsHCGzPxOEIAAAABgAAAFBLAQIUABQACAAIABZKY13Wns14CAAAAAYAAAALAAAAAAAAAAAAAACAAQAAAABwYWdlMDAxLmpwZ1BLAQIUABQACAAIABZKY11sz8ThCAAAAAYAAAALAAAAAAAAAAAAAACAAUEAAABwYWdlMDAyLmpwZ1BLBQYAAAAAAgACAHIAAACCAAAAAAA=',
    'base64',
);

// Archive abîmée comme par AdmZip 0.5.16 (beluga-box) en réécrivant une
// archive « en flux » : bit 3 gardé dans les en-têtes, descripteurs perdus.
// AdmZip 0.5.18 ne l'abîme plus ainsi, mais refuse toujours de la lire.
const DAMAGED_ZIP = Buffer.from(
    'UEsDBBQACAgIAEVKZV3Wns14CAAAAAYAAAALAAAAcGFnZTAwMS5qcGfLzE1MTzUEAFBLAwQUAAgICABFSmVdbM/E4QgAAAAGAAAACwAAAHBhZ2UwMDIuanBny8xNTE81AgBQSwECFAoUAAgICABFSmVd1p7NeAgAAAAGAAAACwAAAAAAAAAAAAAApIEAAAAAcGFnZTAwMS5qcGdQSwECFAoUAAgICABFSmVdbM/E4QgAAAAGAAAACwAAAAAAAAAAAAAApIExAAAAcGFnZTAwMi5qcGdQSwUGAAAAAAIAAgByAAAAYgAAAAAA',
    'base64',
);

const pages = (file: string) =>
    new AdmZip(file)
        .getEntries()
        .filter((e) => e.entryName.startsWith('page'))
        .map((e) => e.getData().toString());

const comicInfoOf = (file: string) =>
    readComicInfo(new AdmZip(file).getEntries());

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'archive-write-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('updateComicInfo', () => {
    it('merges the changes into the existing ComicInfo', async () => {
        const file = path.join(dir, 'T01.cbz');
        const zip = new AdmZip();
        zip.addFile('001.jpg', Buffer.from('image'));
        zip.addFile(
            'comicinfo.xml',
            buildComicInfoXml({ Series: 'Old', Writer: 'Endo', Year: 2019 }),
        );
        await writeFile(file, zip.toBuffer());

        const result = await updateComicInfo(file, {
            Series: 'Spy x Family',
            Number: '1',
            Writer: null,
            Summary: '',
        });

        expect(result).toEqual({
            Series: 'Spy x Family',
            Number: '1',
            Year: 2019,
        });
        expect(await comicInfoOf(file)).toEqual(result);
        // Une seule entrée ComicInfo, quelle que soit la casse d'origine.
        expect(
            new AdmZip(file)
                .getEntries()
                .map((e) => e.entryName)
                .sort(),
        ).toEqual(['001.jpg', 'ComicInfo.xml']);
    });

    it('escapes XML special characters', async () => {
        const file = path.join(dir, 'T01.cbz');
        const zip = new AdmZip();
        zip.addFile('001.jpg', Buffer.from('image'));
        await writeFile(file, zip.toBuffer());

        await updateComicInfo(file, { Title: 'Tom & Jerry <3' });

        expect((await comicInfoOf(file)).Title).toBe('Tom & Jerry <3');
    });

    it('keeps a streamed archive readable after saving', async () => {
        const file = path.join(dir, 'T14.cbz');
        await writeFile(file, STREAMED_ZIP);

        await updateComicInfo(file, { Series: 'Spy x Family' });

        expect(pages(file)).toEqual(['image1', 'image2']);
    });
});

describe('openArchive', () => {
    it('repairs an archive whose descriptors were lost', async () => {
        const file = path.join(dir, 'T14.cbz');
        await writeFile(file, DAMAGED_ZIP);
        expect(() => pages(file)).toThrow('No descriptor present');

        await openArchive(file);

        expect(pages(file)).toEqual(['image1', 'image2']);
    });
});

describe('CBR', () => {
    it('recognizes .cbr files and RAR content', async () => {
        expect(isCbr('a/Tome 1.CBR')).toBe(true);
        expect(isCbr('a/Tome 1.cbz')).toBe(false);
        const rar = path.join(dir, 'Tome 11.cbz');
        await writeFile(rar, Buffer.from('Rar! ', 'latin1'));
        expect(await isRarArchive(rar)).toBe(true);
    });

    it('renames a .cbr that is actually a ZIP', async () => {
        const zip = new AdmZip();
        zip.addFile('001.jpg', Buffer.from('image'));
        const cbr = path.join(dir, 'Tome 14.cbr');
        await writeFile(cbr, zip.toBuffer());

        const cbz = await convertCbrToCbz(cbr);

        expect(cbz).toBe(path.join(dir, 'Tome 14.cbz'));
        expect(await readdir(dir)).toEqual(['Tome 14.cbz']);
    });

    it('never overwrites an existing .cbz, and keeps an invalid .cbr', async () => {
        const cbr = path.join(dir, 'Tome 14.cbr');
        await writeFile(cbr, 'PK...');
        await writeFile(path.join(dir, 'Tome 14.cbz'), 'existant');
        await expect(convertCbrToCbz(cbr)).rejects.toThrow('existe déjà');

        const invalid = path.join(dir, 'Tome 15.cbr');
        await writeFile(invalid, 'pas une archive');
        await expect(convertCbrToCbz(invalid)).rejects.toThrow();
        expect((await readdir(dir)).sort()).toEqual([
            'Tome 14.cbr',
            'Tome 14.cbz',
            'Tome 15.cbr',
        ]);
    });
});
