import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    clearDownloads,
    jobsProgress,
    queueDownloads,
} from '@/offline/downloads';
import { installFakeCaches, removeFakeCaches } from '@/test/fakeCaches';

import { DownloadIndicator } from './DownloadIndicator';

// Pages retenues jusqu'à `release()` : le téléchargement reste en cours.
let release: () => void = () => {};

beforeEach(() => {
    installFakeCaches();
    const held = new Promise<void>((resolve) => (release = resolve));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        const json = (body: unknown) =>
            new Response(JSON.stringify(body), {
                headers: { 'Content-Type': 'application/json' },
            });
        if (url === '/api/volumes/7') {
            return json({
                id: 7,
                version: 1,
                pageCount: 2,
                seriesName: 'Gantz',
            });
        }
        if (url.endsWith('/page-sizes'))
            return json([
                [1, 1],
                [1, 1],
            ]);
        if (url.includes('/pages/')) await held;
        return new Response(new Uint8Array(4));
    });
});

afterEach(async () => {
    release();
    await clearDownloads();
    removeFakeCaches();
    vi.restoreAllMocks();
});

describe('DownloadIndicator', () => {
    it('shows the progress while volumes download, then goes away', async () => {
        render(
            <MantineProvider>
                <MemoryRouter>
                    <DownloadIndicator />
                </MemoryRouter>
            </MantineProvider>,
        );
        expect(screen.queryByLabelText(/Téléchargements en cours/)).toBeNull();

        queueDownloads([{ id: 7, label: 'Gantz, tome 1' }], 1);
        const indicator = await screen.findByLabelText(
            'Téléchargements en cours : 0 %',
        );
        expect(indicator.getAttribute('href')).toBe('/downloads');

        release();
        await vi.waitFor(() =>
            expect(
                screen.queryByLabelText(/Téléchargements en cours/),
            ).toBeNull(),
        );
    });

    it('averages the progress of the volumes', () => {
        expect(jobsProgress([])).toBeUndefined();
        expect(
            jobsProgress([
                {
                    volumeId: 1,
                    label: '',
                    done: 5,
                    total: 10,
                    state: 'running',
                },
                { volumeId: 2, label: '', done: 0, total: 0, state: 'waiting' },
                { volumeId: 3, label: '', done: 0, total: 0, state: 'failed' },
            ]),
        ).toEqual({ count: 2, ratio: 0.25 });
    });
});
