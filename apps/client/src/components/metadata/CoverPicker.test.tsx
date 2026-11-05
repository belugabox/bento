import { MantineProvider } from '@mantine/core';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CoverSource } from '@/services/api';

import { CoverPicker, type CoverVolume } from './CoverPicker';

const volume = (n: number, pageCount = 3): CoverVolume => ({
    key: `v${n}`,
    label: `Tome ${n}`,
    pageCount,
    cover: `/cover/${n}`,
    page: (index) => `/page/${n}/${index}`,
    source: (page) => ({ type: 'volume', volumeId: n, page }),
});

const show = (volumes = [volume(1), volume(2)]) => {
    const save = vi.fn<(source: CoverSource) => Promise<unknown>>(
        async () => ({}),
    );
    const onChanged = vi.fn();
    render(
        <MantineProvider>
            <CoverPicker
                opened
                onClose={() => {}}
                seriesName="Gantz"
                kind="manga"
                volumes={volumes}
                save={save}
                onChanged={onChanged}
            />
        </MantineProvider>,
    );
    return { save, onChanged };
};

describe('CoverPicker', () => {
    it('previews a volume, then saves it with the chosen framing', async () => {
        const { save, onChanged } = show();

        fireEvent.click(await screen.findByText('Tome 2'));
        expect(screen.getByAltText('Aperçu').getAttribute('src')).toBe(
            '/page/2/0',
        );
        fireEvent.click(screen.getByText('Bas'));
        await act(async () => {
            fireEvent.click(screen.getByText('Utiliser cette couverture'));
        });

        expect(save).toHaveBeenCalledWith({
            type: 'volume',
            volumeId: 2,
            page: undefined,
            position: 'bottom',
        });
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
    });

    it('lists the pages of a volume, a batch at a time', async () => {
        const { save } = show([volume(1, 30)]);

        fireEvent.click(await screen.findByText('Une page'));
        expect(await screen.findByText('Page 24')).toBeTruthy();
        expect(screen.queryByText('Page 25')).toBeNull();
        fireEvent.click(screen.getByText(/Pages suivantes/));
        fireEvent.click(await screen.findByText('Page 30'));
        await act(async () => {
            fireEvent.click(screen.getByText('Utiliser cette couverture'));
        });

        expect(save).toHaveBeenCalledWith({
            type: 'volume',
            volumeId: 1,
            page: 29,
            position: 'top',
        });
    });

    it('goes back to the default cover', async () => {
        const { save } = show();

        await act(async () => {
            fireEvent.click(
                await screen.findByText(
                    'Revenir à la couverture du premier tome',
                ),
            );
        });

        expect(save).toHaveBeenCalledWith({ type: 'default' });
    });
});
