import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RequireUser } from '@/components/RequireUser';

import { useCurrentUser } from './auth';
import {
    NetworkError,
    isOnline,
    reachServer,
    reportNetworkOk,
} from './network';

const USER = {
    id: 2,
    name: 'Lucien',
    username: 'lucien',
    email: null,
    avatarSeed: null,
    hasPassword: true,
    role: 'reader',
    maxAge: 10,
    preview: null,
};

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    reportNetworkOk();
});

const Name = () => <p>{useCurrentUser().name}</p>;

const show = () =>
    render(
        <MantineProvider>
            <RequireUser>
                <Name />
            </RequireUser>
        </MantineProvider>,
    );

describe('network', () => {
    it('goes offline when a call reaches no server, online on an answer', async () => {
        await expect(
            reachServer(() => Promise.reject(new TypeError('Failed to fetch'))),
        ).rejects.toBeInstanceOf(NetworkError);
        expect(isOnline()).toBe(false);

        await reachServer(async () => 'ok');
        expect(isOnline()).toBe(true);
    });

    it('keeps the person on the device, to open Bento without network', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify(USER), {
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        const online = show();
        expect(await screen.findByText('Lucien')).toBeTruthy();
        online.unmount();

        // Sans réseau : la personne gardée.
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(
            new TypeError('Failed to fetch'),
        );
        show();
        expect(await screen.findByText('Lucien')).toBeTruthy();
    });

    it('needs the network the first time', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(
            new TypeError('Failed to fetch'),
        );
        show();
        expect(await screen.findByText('Pas de réseau')).toBeTruthy();
    });
});
