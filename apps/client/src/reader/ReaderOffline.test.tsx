import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    clearDownloads,
    getDownload,
    queueDownloads,
} from '@/offline/downloads';
import { SeriesPage } from '@/pages/SeriesPage';
import { type CurrentUser, UserContext } from '@/services/auth';
import { reportNetworkOk } from '@/services/network';
import { installFakeCaches, removeFakeCaches } from '@/test/fakeCaches';

import { ReaderPage } from './ReaderPage';

const USER = {
    id: 1,
    name: 'Lucien',
    role: 'reader',
    preview: null,
} as unknown as CurrentUser;

let online = true;

beforeEach(() => {
    installFakeCaches();
    online = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        if (!online) throw new TypeError('Failed to fetch');
        const url = String(input);
        const json = (body: unknown) =>
            new Response(JSON.stringify(body), {
                headers: { 'Content-Type': 'application/json' },
            });
        if (url === '/api/volumes/7') {
            return json({
                id: 7,
                seriesId: 3,
                seriesName: 'Gantz',
                number: '1',
                kind: 'volume',
                title: null,
                pageCount: 2,
                version: 1,
                readingMode: 'ltr',
                previousId: null,
                nextId: null,
                progress: null,
            });
        }
        if (url.endsWith('/page-sizes'))
            return json([
                [800, 1200],
                [800, 1200],
            ]);
        return new Response(new Uint8Array(4));
    });
});

afterEach(async () => {
    await clearDownloads();
    removeFakeCaches();
    vi.restoreAllMocks();
    reportNetworkOk();
});

const show = (url: string) =>
    render(
        <MantineProvider>
            <UserContext.Provider value={USER}>
                <MemoryRouter initialEntries={[url]}>
                    <Routes>
                        <Route path="/read/:id" element={<ReaderPage />} />
                        <Route path="/series/:id" element={<SeriesPage />} />
                    </Routes>
                </MemoryRouter>
            </UserContext.Provider>
        </MantineProvider>,
    );

describe('without network', () => {
    it('leaves the reader for the volumes of the device, not the series', async () => {
        queueDownloads([{ id: 7, label: 'Gantz, tome 1' }], 1);
        await vi.waitFor(async () => expect(await getDownload(7)).toBeTruthy());
        online = false;

        show('/read/7');
        const back = await screen.findByRole('link', {
            name: 'Retour aux téléchargements',
        });
        expect(back.getAttribute('href')).toBe('/');
    });

    it('explains that a series sheet needs the network', async () => {
        online = false;
        show('/series/3');
        expect(await screen.findByText('Pas de réseau')).toBeTruthy();
        expect(
            screen
                .getByRole('link', { name: 'Voir les tomes de l’appareil' })
                .getAttribute('href'),
        ).toBe('/');
    });
});
