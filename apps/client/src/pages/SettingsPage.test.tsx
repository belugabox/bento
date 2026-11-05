import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsPage } from './SettingsPage';

const DEFAULTS = {
    compression: { quality: 85, maxHeight: 2400 },
    scanIntervalMinutes: 30,
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SettingsPage', () => {
    it('saves the compression settings', async () => {
        let saved = DEFAULTS;
        const puts: unknown[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (_input, init) => {
                if (init?.method === 'PUT') {
                    const body = JSON.parse(String(init.body));
                    puts.push(body);
                    saved = body;
                }
                return new Response(
                    JSON.stringify({ settings: saved, defaults: DEFAULTS }),
                    { headers: { 'Content-Type': 'application/json' } },
                );
            },
        );
        render(
            <MantineProvider>
                <SettingsPage />
            </MantineProvider>,
        );

        expect(await screen.findByText('Qualité JPEG : 85')).toBeTruthy();
        const save = screen.getByRole('button', { name: 'Enregistrer' });
        expect(save.hasAttribute('disabled')).toBe(true);

        fireEvent.click(
            screen.getByRole('textbox', { name: 'Hauteur maximale des pages' }),
        );
        fireEvent.click(await screen.findByText(/Taille d’origine/));
        fireEvent.change(
            screen.getByRole('textbox', {
                name: 'Scan automatique toutes les (minutes)',
            }),
            { target: { value: '0' } },
        );
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Enregistrer' }),
            );
        });

        expect(puts).toEqual([
            {
                compression: { quality: 85, maxHeight: null },
                scanIntervalMinutes: 0,
            },
        ]);
        expect(await screen.findByText('Réglages enregistrés.')).toBeTruthy();
        expect(
            screen
                .getByRole('button', { name: 'Valeurs par défaut' })
                .hasAttribute('disabled'),
        ).toBe(false);
    });
});
