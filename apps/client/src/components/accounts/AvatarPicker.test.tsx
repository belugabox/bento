import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatAvatar, parseAvatar } from '@server/types';

import { AvatarPicker } from './AvatarPicker';

const START = formatAvatar({
    body: 'pear',
    top: 'horns',
    pattern: null,
    eyes: 'googly',
    mouth: 'smile',
    bodyColor: 'c4795c',
    accentColor: '8ba06b',
    background: 'b6e3f4',
});

let current = '';

const Picker = ({ start }: { start: string }) => {
    const [value, setValue] = useState(start);
    current = value;
    return <AvatarPicker value={value} onChange={setValue} />;
};

const edit = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser' }));
    await screen.findByRole('tab', { name: 'Corps' });
};

const show = (start = START) =>
    render(
        <MantineProvider>
            <Picker start={start} />
        </MantineProvider>,
    );

afterEach(() => {
    vi.restoreAllMocks();
});

describe('AvatarPicker', () => {
    it('hides the editing until asked', async () => {
        show();

        expect(screen.queryByRole('tab', { name: 'Corps' })).toBeNull();
        await edit();
    });

    it('changes one part, keeping the others', async () => {
        show();
        await edit();

        fireEvent.click(screen.getByRole('tab', { name: 'Yeux' }));
        fireEvent.click(screen.getByRole('button', { name: 'Yeux 12' }));
        expect(parseAvatar(current)).toMatchObject({
            eyes: 'wink',
            body: 'pear',
            top: 'horns',
        });

        fireEvent.click(screen.getByRole('tab', { name: 'Tête' }));
        fireEvent.click(screen.getByRole('button', { name: 'Tête : sans' }));
        expect(parseAvatar(current)).toMatchObject({ top: null, eyes: 'wink' });
    });

    it('changes colors', async () => {
        show();
        await edit();

        fireEvent.click(screen.getByRole('tab', { name: 'Couleurs' }));
        fireEvent.click(screen.getByRole('button', { name: 'Fond : #ffd5dc' }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Détails : #c4795c' }),
        );
        expect(parseAvatar(current)).toMatchObject({
            background: 'ffd5dc',
            accentColor: 'c4795c',
        });
    });

    it('edits an avatar drawn from a seed, from its parts', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify(parseAvatar(START)), {
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        show('abc');

        const open = screen.getByRole('button', { name: 'Personnaliser' });
        await vi.waitFor(() =>
            expect(open.hasAttribute('disabled')).toBe(false),
        );
        await edit();
        fireEvent.click(screen.getByRole('tab', { name: 'Bouche' }));
        fireEvent.click(screen.getByRole('button', { name: 'Bouche 16' }));
        expect(parseAvatar(current)).toMatchObject({
            body: 'pear',
            mouth: 'cat',
        });
    });

    it('offers other ideas', () => {
        show();

        fireEvent.click(screen.getByRole('button', { name: 'Idée 3' }));
        expect(parseAvatar(current)).toBeDefined();
        expect(current).not.toBe(START);
    });
});
