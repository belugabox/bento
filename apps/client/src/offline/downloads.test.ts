import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportNetworkOk } from '@/services/network';
import { installFakeCaches, removeFakeCaches } from '@/test/fakeCaches';

import {
    clearDownloads,
    deleteDownload,
    getDownload,
    keepOnlyDownloadsOf,
    queueDownloads,
    refreshDownloads,
    saveLocalProgress,
} from './downloads';
import { loadPageSizes, loadVolume } from './reading';

const VOLUME = {
    id: 7,
    seriesId: 3,
    seriesName: 'Gantz',
    number: '1',
    kind: 'volume',
    title: null,
    pageCount: 3,
    version: 1700000000000,
    pageSizes: null,
    libraryType: 'manga',
    readingMode: 'ltr-manga',
    previousId: null,
    nextId: 8,
    progress: { page: 0, completed: false },
};

let online = true;
let requested: string[] = [];

beforeEach(() => {
    installFakeCaches();
    online = true;
    requested = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (!online) throw new TypeError('Failed to fetch');
        requested.push(url);
        const json = (body: unknown) =>
            new Response(JSON.stringify(body), {
                headers: { 'Content-Type': 'application/json' },
            });
        if (url === '/api/volumes/7') return json(VOLUME);
        if (url === '/api/volumes/7/page-sizes') {
            return json([
                [800, 1200],
                [800, 1200],
                [1600, 1200],
            ]);
        }
        // Images : quelques octets.
        return new Response(new Uint8Array(10), {
            headers: { 'Content-Type': 'image/webp' },
        });
    });
});

afterEach(async () => {
    await clearDownloads();
    removeFakeCaches();
    vi.restoreAllMocks();
    reportNetworkOk();
});

/** Télécharge le tome 7, et attend la fin. */
const download = async () => {
    queueDownloads([{ id: 7, label: 'Gantz, tome 1' }], 1);
    await vi.waitFor(async () => expect(await getDownload(7)).toBeTruthy());
};

describe('downloads', () => {
    it('keeps the cover, every page at the screen width, and the sheet', async () => {
        await download();

        expect(requested).toContain(
            '/api/volumes/7/cover?v=1700000000000&size=small',
        );
        for (const index of [0, 1, 2]) {
            expect(requested).toContain(
                `/api/volumes/7/pages/${index}?v=1700000000000&w=800`,
            );
        }
        const meta = (await getDownload(7))!;
        expect(meta).toMatchObject({ userId: 1, seriesName: 'Gantz' });
        // Couverture et trois pages, 10 octets chacune.
        expect(meta.bytes).toBe(40);
        expect((await refreshDownloads()).map((d) => d.id)).toEqual([7]);
    });

    it('reads a downloaded volume without network, with its reading on the device', async () => {
        await download();
        await saveLocalProgress(7, { page: 2, completed: true });
        online = false;

        const volume = await loadVolume(7);
        expect(volume.progress).toMatchObject({ page: 2, completed: true });
        expect(await loadPageSizes(7)).toHaveLength(3);
        // Un tome pas téléchargé : il faut du réseau.
        await expect(loadVolume(8)).rejects.toThrow(/pas téléchargé/);
    });

    it('removes a volume, or everything when another account signs in', async () => {
        await download();
        await deleteDownload(7);
        expect(await getDownload(7)).toBeUndefined();

        await download();
        await keepOnlyDownloadsOf(1);
        expect(await getDownload(7)).toBeTruthy();
        await keepOnlyDownloadsOf(2);
        expect(await getDownload(7)).toBeUndefined();
    });
});
