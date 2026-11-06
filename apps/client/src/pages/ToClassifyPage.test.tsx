import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToClassifyPage } from './ToClassifyPage';

const listed = (
    id: number,
    name: string,
    formatId: number | null,
    age: number | null,
) => ({
    id,
    name,
    formatId,
    format: formatId ? 'Manga' : null,
    age,
    coverUpdatedAt: null,
    coverVolumeId: id * 10,
    coverVolumeVersion: 1,
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ToClassifyPage', () => {
    it('lists the series without format or age, with what is missing', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify([
                    listed(1, 'Spirale', 1, null),
                    listed(2, 'Coq de combat', null, 16),
                    listed(3, 'Gantz', 1, 16),
                ]),
                { headers: { 'Content-Type': 'application/json' } },
            ),
        );
        render(
            <MantineProvider>
                <MemoryRouter>
                    <ToClassifyPage />
                </MemoryRouter>
            </MantineProvider>,
        );

        const rows = (await screen.findAllByRole('row')).slice(1);
        expect(
            // Premier lien de chaque ligne : le nom de la série.
            rows.map((row) => within(row).getAllByRole('link')[0]!.textContent),
        ).toEqual(['Coq de combat', 'Spirale']);
        expect(within(rows[0]!).getByText('Format')).toBeTruthy();
        expect(within(rows[1]!).getByText('Âge')).toBeTruthy();
        // « Remplir » ouvre l'éditeur, recherche en ligne lancée.
        expect(
            within(rows[0]!)
                .getByRole('link', { name: /Remplir/ })
                .getAttribute('href'),
        ).toBe('/series/2/edit?fill=online');
    });
});
