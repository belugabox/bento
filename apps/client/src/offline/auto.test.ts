import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFakeCaches, removeFakeCaches } from '@/test/fakeCaches';

import { readLongAgo, runAutoDownloads } from './auto';
import {
    type DownloadedVolume,
    clearDownloads,
    getDownload,
} from './downloads';

const volume = (id: number, completed = false) => ({
    id,
    number: String(id),
    kind: 'volume',
    title: null,
    pageCount: 1,
    version: 1,
    progress: completed ? { page: 0, completed: true } : null,
});

beforeEach(() => {
    installFakeCaches();
    localStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        const json = (body: unknown) =>
            new Response(JSON.stringify(body), {
                headers: { 'Content-Type': 'application/json' },
            });
        // Gantz : tome 1 lu, le 2 en cours ; puis 3 et 4.
        if (url === '/api/continue')
            return json([{ seriesId: 3, volumeId: 2 }]);
        if (url === '/api/series/3') {
            return json({
                name: 'Gantz',
                volumes: [volume(1, true), volume(2), volume(3), volume(4)],
            });
        }
        const id = Number(/volumes\/(\d+)/.exec(url)?.[1]);
        if (/\/api\/volumes\/\d+$/.test(url)) {
            return json({ ...volume(id), seriesId: 3, seriesName: 'Gantz' });
        }
        if (url.endsWith('/page-sizes')) return json([[800, 1200]]);
        return new Response(new Uint8Array(4));
    });
});

afterEach(async () => {
    await clearDownloads();
    removeFakeCaches();
    vi.restoreAllMocks();
});

describe('automatic downloads', () => {
    it('does nothing until turned on', async () => {
        expect(await runAutoDownloads(1, true)).toBe(0);
    });

    it('keeps the volume being read and the next ones', async () => {
        localStorage.setItem(
            'bento:offline',
            JSON.stringify({ enabled: true, count: 2 }),
        );
        expect(await runAutoDownloads(1, true)).toBe(2);
        await vi.waitFor(async () => {
            expect(await getDownload(2)).toBeTruthy();
            expect(await getDownload(3)).toBeTruthy();
        });
        expect(await getDownload(4)).toBeUndefined();
    });

    it('drops volumes read more than 30 days ago', () => {
        const now = Date.parse('2026-11-10');
        const read = (at: number) =>
            ({
                progress: null,
                localProgress: { page: 0, completed: true, at },
                downloadedAt: at,
            }) as unknown as DownloadedVolume;
        expect(readLongAgo(read(now - 40 * 86_400_000), now)).toBe(true);
        expect(readLongAgo(read(now - 5 * 86_400_000), now)).toBe(false);
    });
});
