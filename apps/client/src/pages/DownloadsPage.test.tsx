import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    clearDownloads,
    getDownload,
    queueDownloads,
    saveLocalProgress,
} from '@/offline/downloads';
import { type CurrentUser, UserContext } from '@/services/auth';
import { installFakeCaches, removeFakeCaches } from '@/test/fakeCaches';

import { DownloadsPage } from './DownloadsPage';

const USER = {
    id: 1,
    name: 'Lucien',
    role: 'reader',
    preview: null,
} as unknown as CurrentUser;

const volume = (id: number) => ({
    id,
    seriesId: 3,
    seriesName: 'Gantz',
    number: String(id),
    kind: 'volume',
    title: null,
    pageCount: 1,
    version: 1,
    progress: null,
});

beforeEach(() => {
    installFakeCaches();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        const json = (body: unknown) =>
            new Response(JSON.stringify(body), {
                headers: { 'Content-Type': 'application/json' },
            });
        // Gantz en cours au tome 1 ; tomes 1 et 2 sur l'appareil, 3 proposé.
        if (url === '/api/continue') {
            return json([{ seriesId: 3, volumeId: 1 }]);
        }
        if (url === '/api/series/3') {
            return json({
                id: 3,
                name: 'Gantz',
                volumes: [volume(1), volume(2), volume(3), volume(4)],
            });
        }
        const id = Number(/volumes\/(\d+)$/.exec(url)?.[1]);
        if (id) return json(volume(id));
        if (url.endsWith('/page-sizes')) return json([[800, 1200]]);
        return new Response(new Uint8Array(4));
    });
});

afterEach(async () => {
    localStorage.clear();
    await clearDownloads();
    removeFakeCaches();
    vi.restoreAllMocks();
});

const show = () =>
    render(
        <MantineProvider>
            <UserContext.Provider value={USER}>
                <MemoryRouter>
                    <DownloadsPage />
                </MemoryRouter>
            </UserContext.Provider>
        </MantineProvider>,
    );

describe('DownloadsPage', () => {
    it('lists the volumes of the device, proposals, and the automatic mode apart', async () => {
        queueDownloads(
            [
                { id: 1, label: 'Gantz, tome 1' },
                { id: 2, label: 'Gantz, tome 2' },
            ],
            1,
        );
        await vi.waitFor(async () => expect(await getDownload(2)).toBeTruthy());
        await saveLocalProgress(1, { page: 0, completed: true });
        // Trois tomes proposés par série : le 3 manque.
        localStorage.setItem('bento:offline', JSON.stringify({ count: 3 }));
        show();

        const device = await screen.findByRole('region', {
            name: 'Sur cet appareil',
        });
        expect(await within(device).findByText('Gantz — Tome 1')).toBeTruthy();
        expect(within(device).getByText(/^Lu · /)).toBeTruthy();
        expect(within(device).getByText(/^Pas commencé · /)).toBeTruthy();

        // Propositions : les tomes en cours et suivants pas encore là.
        const proposals = screen.getByRole('region', { name: 'Propositions' });
        expect(
            await within(proposals).findByRole('button', {
                name: 'Télécharger Gantz, tome 3',
            }),
        ).toBeTruthy();
        expect(within(proposals).queryByText('Gantz, tome 2')).toBeNull();

        // Automatique : à part.
        expect(
            within(
                screen.getByRole('region', { name: 'Automatique' }),
            ).getByRole('switch', {
                name: 'Télécharger les propositions tout seul',
            }),
        ).toBeTruthy();

        // Tomes lus, puis un tome par sa corbeille.
        await act(async () => {
            fireEvent.click(
                within(device).getByRole('button', {
                    name: 'Supprimer les tomes lus (1)',
                }),
            );
        });
        await vi.waitFor(async () =>
            expect(await getDownload(1)).toBeUndefined(),
        );
        await act(async () => {
            fireEvent.click(
                within(device).getByRole('button', {
                    name: 'Supprimer Gantz, tome 2',
                }),
            );
        });
        await vi.waitFor(async () =>
            expect(await getDownload(2)).toBeUndefined(),
        );
    });
});
