import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppearanceModal } from './AppearanceModal';
import { useAppearance } from './theme';

/** Thème tel que le voit le reste de l'appli. */
const Probe = () => {
    const { accent, colorScheme, resolved } = useAppearance();
    return (
        <span data-testid="theme">{`${accent} ${colorScheme} ${resolved}`}</span>
    );
};

const theme = () => screen.getByTestId('theme').textContent;

beforeEach(() => {
    localStorage.clear();
});

const show = () =>
    render(
        <MantineProvider>
            <AppearanceModal opened onClose={() => {}} />
            <Probe />
        </MantineProvider>,
    );

describe('AppearanceModal', () => {
    it('follows the system, in violet, by default', () => {
        show();

        // Pas de préférence sombre dans les tests : « Système » donne le clair.
        expect(theme()).toBe('violet auto light');
        expect(screen.getByText('Thème par défaut de Bento.')).toBeTruthy();
    });

    it("uses the admin's default theme while the device has none", () => {
        localStorage.setItem(
            'bento:theme:defaults',
            JSON.stringify({ colorScheme: 'light', accent: 'teal' }),
        );
        show();

        expect(theme()).toBe('teal light light');
    });

    it('keeps the choice of the device, until it goes back to the default', async () => {
        show();

        await act(async () => {
            fireEvent.click(await screen.findByLabelText('Prune'));
            fireEvent.click(screen.getByText('Clair'));
        });

        expect(theme()).toBe('grape light light');
        expect(
            screen.getByLabelText('Prune').getAttribute('aria-pressed'),
        ).toBe('true');
        expect(localStorage.getItem('bento:theme:accent')).toBe('"grape"');

        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Thème par défaut' }),
            );
        });

        expect(theme()).toBe('violet auto light');
    });
});
