import AdmZip from 'adm-zip';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readArchive } from '../src/archive/archive';

// Archive « en flux » : bit 3 et descripteurs après les données.
const STREAMED_ZIP = Buffer.from(
    'UEsDBBQACAAIABZKY10AAAAAAAAAAAAAAAALAAAAcGFnZTAwMS5qcGfLzE1MTzUEAFBLBwjWns14CAAAAAYAAABQSwMEFAAIAAgAFkpjXQAAAAAAAAAAAAAAAAsAAABwYWdlMDAyLmpwZ8vMTUxPNQIAUEsHCGzPxOEIAAAABgAAAFBLAQIUABQACAAIABZKY13Wns14CAAAAAYAAAALAAAAAAAAAAAAAACAAQAAAABwYWdlMDAxLmpwZ1BLAQIUABQACAAIABZKY11sz8ThCAAAAAYAAAALAAAAAAAAAAAAAACAAUEAAABwYWdlMDAyLmpwZ1BLBQYAAAAAAgACAHIAAACCAAAAAAA=',
    'base64',
);

// Même archive abîmée : bit 3 gardé, descripteurs perdus.
const DAMAGED_ZIP = Buffer.from(
    'UEsDBBQACAgIAEVKZV3Wns14CAAAAAYAAAALAAAAcGFnZTAwMS5qcGfLzE1MTzUEAFBLAwQUAAgICABFSmVdbM/E4QgAAAAGAAAACwAAAHBhZ2UwMDIuanBny8xNTE81AgBQSwECFAoUAAgICABFSmVd1p7NeAgAAAAGAAAACwAAAAAAAAAAAAAApIEAAAAAcGFnZTAwMS5qcGdQSwECFAoUAAgICABFSmVdbM/E4QgAAAAGAAAACwAAAAAAAAAAAAAApIExAAAAcGFnZTAwMi5qcGdQSwUGAAAAAAIAAgByAAAAYgAAAAAA',
    'base64',
);

const contentsOf = async (file: string) => {
    const contents: Record<string, string> = {};
    for (const entry of await readArchive(file)) {
        if (entry.isDirectory) continue;
        contents[entry.entryName] = (await entry.getData()).toString();
    }
    return contents;
};

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'zip-index-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('readArchive', () => {
    it('reads only the start of an entry, stored or deflated', async () => {
        const zip = new AdmZip();
        const text = Array.from({ length: 2000 }, (_, i) => i).join(',');
        zip.addFile('stored.txt', Buffer.from(text));
        zip.getEntry('stored.txt')!.header.method = 0;
        zip.addFile('deflated.txt', Buffer.from(text));
        const file = path.join(dir, 'T01.cbz');
        await writeFile(file, zip.toBuffer());

        for (const entry of await readArchive(file)) {
            expect((await entry.getStart(100)).toString()).toBe(
                text.slice(0, 100),
            );
            expect((await entry.getStart(1e6)).toString()).toBe(text);
        }
    });

    it('reads stored and deflated entries, with accented names', async () => {
        const zip = new AdmZip();
        zip.addFile('Été/001.jpg', Buffer.from('a'.repeat(5000)));
        zip.addFile('Été/', Buffer.alloc(0));
        zip.addFile('ComicInfo.xml', Buffer.from('<ComicInfo/>'));
        // Entrée stockée sans compression.
        zip.getEntry('ComicInfo.xml')!.header.method = 0;
        const file = path.join(dir, 'T01.cbz');
        await writeFile(file, zip.toBuffer());

        expect(await contentsOf(file)).toEqual({
            'Été/001.jpg': 'a'.repeat(5000),
            'ComicInfo.xml': '<ComicInfo/>',
        });
        const entries = await readArchive(file);
        expect(entries.find((e) => e.entryName === 'Été/')?.isDirectory).toBe(
            true,
        );
    });

    it('reads an archive whose entries are followed by descriptors', async () => {
        const file = path.join(dir, 'T14.cbz');
        await writeFile(file, STREAMED_ZIP);

        expect(await contentsOf(file)).toEqual({
            'page001.jpg': 'image1',
            'page002.jpg': 'image2',
        });
        // Rien n'a été réécrit.
        expect(await readFile(file)).toEqual(STREAMED_ZIP);
    });

    it('repairs an archive whose descriptors were lost', async () => {
        const file = path.join(dir, 'T14.cbz');
        await writeFile(file, DAMAGED_ZIP);

        expect(await contentsOf(file)).toEqual({
            'page001.jpg': 'image1',
            'page002.jpg': 'image2',
        });
        const repaired = new AdmZip(file);
        expect(repaired.getEntry('page002.jpg')!.getData().toString()).toBe(
            'image2',
        );
    });

    it('explains why a truncated archive is unreadable', async () => {
        const zip = new AdmZip();
        zip.addFile('001.jpg', Buffer.from('image'));
        const data = zip.toBuffer();
        const file = path.join(dir, 'T01.cbz');
        await writeFile(file, data.subarray(0, data.length - 10));

        await expect(readArchive(file)).rejects.toThrow(
            'archive ZIP incomplète',
        );
    });
});
