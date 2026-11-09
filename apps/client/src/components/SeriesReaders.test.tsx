import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SeriesReaders } from './SeriesReaders';

const answer = (body: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(body), {
            headers: { 'Content-Type': 'application/json' },
        }),
    );

const show = () =>
    render(
        <MantineProvider>
            <SeriesReaders seriesId={3} />
        </MantineProvider>,
    );

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SeriesReaders', () => {
    it('shows the avatars of those who read the series', async () => {
        const fetch = answer([
            { id: 2, name: 'Léa', avatarSeed: 'abc', percent: 100 },
            { id: 3, name: 'Zoé', avatarSeed: null, percent: 60 },
        ]);
        show();

        expect(await screen.findByText('Lu par')).toBeTruthy();
        expect(screen.getByAltText('Léa').getAttribute('src')).toMatch(
            /\/api\/avatars\/abc/,
        );
        // Sans avatar choisi : ses initiales.
        expect(screen.getByText(/^Z/)).toBeTruthy();
        // Au clic : le nom et l'avancement de chacun.
        fireEvent.click(screen.getByRole('button', { name: 'Lu par' }));
        expect(await screen.findByText('Tout lu')).toBeTruthy();
        expect(screen.getByText('60 % lu')).toBeTruthy();
        expect(screen.getByText('Zoé')).toBeTruthy();
        expect(String(fetch.mock.calls[0]![0])).toMatch(
            /\/api\/series\/3\/readers$/,
        );
    });

    it('shows nothing when nobody read it', async () => {
        const fetch = answer([]);
        show();

        await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.queryByText('Lu par')).toBeNull();
    });
});
