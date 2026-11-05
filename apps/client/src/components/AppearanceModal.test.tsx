import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppearanceModal } from './AppearanceModal';
import { useAccent } from './theme';

/** Couleur d'accent telle que la voit le reste de l'appli. */
const AccentProbe = () => <span data-testid="accent">{useAccent()[0]}</span>;

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-mantine-color-scheme');
});

const show = () =>
    render(
        <MantineProvider defaultColorScheme="dark">
            <AppearanceModal opened onClose={() => {}} />
            <AccentProbe />
        </MantineProvider>,
    );

describe('AppearanceModal', () => {
    it('changes the accent color for the whole app, and keeps it', async () => {
        show();
        expect(screen.getByTestId('accent').textContent).toBe('teal');

        await act(async () => {
            fireEvent.click(await screen.findByLabelText('Violet'));
        });

        expect(screen.getByTestId('accent').textContent).toBe('violet');
        expect(
            screen.getByLabelText('Violet').getAttribute('aria-pressed'),
        ).toBe('true');
        expect(localStorage.getItem('bento:theme:accent')).toBe('"violet"');
    });

    it('switches between light, dark and system modes', async () => {
        show();

        await act(async () => {
            fireEvent.click(await screen.findByText('Clair'));
        });

        expect(
            document.documentElement.getAttribute('data-mantine-color-scheme'),
        ).toBe('light');
    });
});
