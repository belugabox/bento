import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportNetworkError, reportNetworkOk } from '@/services/network';

import {
    flushQueue,
    pendingCount,
    saveProgressOrQueue,
    sendReadingTimeOrQueue,
} from './syncQueue';

let sent: [string, string, unknown][] = [];
let reachable = true;

beforeEach(() => {
    sent = [];
    reachable = true;
    localStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        if (!reachable) throw new TypeError('Failed to fetch');
        sent.push([
            init?.method ?? 'GET',
            String(input),
            init?.body ? JSON.parse(String(init.body)) : undefined,
        ]);
        return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    reportNetworkOk();
});

describe('reading done offline', () => {
    it('is kept on the device, then sent with its real time', async () => {
        reachable = false;
        reportNetworkError();
        await saveProgressOrQueue(1, 7, { page: 3 });
        await saveProgressOrQueue(1, 7, { page: 4 });
        await sendReadingTimeOrQueue(1, 7, { seconds: 60, pages: 2 });
        // La progression d'un tome : seule la dernière compte.
        expect(pendingCount()).toBe(2);
        expect(sent).toEqual([]);

        reachable = true;
        reportNetworkOk();
        await flushQueue(1);

        expect(pendingCount()).toBe(0);
        expect(sent.map(([method, url]) => `${method} ${url}`)).toEqual([
            'PUT /api/volumes/7/progress',
            'POST /api/volumes/7/reading-time',
        ]);
        expect(sent[0]![2]).toMatchObject({ page: 4, at: expect.any(Number) });
        expect(sent[1]![2]).toMatchObject({
            seconds: 60,
            pages: 2,
            at: expect.any(Number),
        });
    });

    it('keeps waiting while the server is out of reach', async () => {
        reachable = false;
        reportNetworkError();
        await saveProgressOrQueue(1, 7, { page: 3 });
        await flushQueue(1);
        expect(pendingCount()).toBe(1);
    });

    it('forgets what another account read on the device', async () => {
        reportNetworkError();
        await saveProgressOrQueue(2, 7, { page: 3 });
        reportNetworkOk();
        await flushQueue(1);
        expect(pendingCount()).toBe(0);
        expect(sent).toEqual([]);
    });

    it('sends at once with network', async () => {
        await saveProgressOrQueue(1, 7, { page: 3 });
        expect(pendingCount()).toBe(0);
        expect(sent).toEqual([['PUT', '/api/volumes/7/progress', { page: 3 }]]);
    });
});
