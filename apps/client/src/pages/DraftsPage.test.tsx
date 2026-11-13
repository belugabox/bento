import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DraftsPage } from './DraftsPage';

const respond = (body: unknown) =>
    new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });

afterEach(() => {
    vi.restoreAllMocks();
});

describe('DraftsPage', () => {
    it('lists the draft folders, then opens one with its volumes', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            if (url === '/api/libraries') {
                return respond([{ id: 1, name: 'Mangas', type: 'manga' }]);
            }
            if (url === '/api/libraries/1/drafts') {
                return respond([
                    {
                        folder: '_draft/Gantz',
                        files: [
                            {
                                path: '_draft/Gantz/T01.cbz',
                                name: 'T01.cbz',
                                size: 10,
                            },
                        ],
                    },
                ]);
            }
            if (
                url.startsWith(
                    '/api/libraries/1/drafts/files?folder=_draft%2FGantz',
                )
            ) {
                return respond([
                    {
                        path: '_draft/Gantz/T01.cbz',
                        name: 'T01.cbz',
                        folder: '_draft/Gantz',
                        size: 10,
                        draft: true,
                        pageCount: 2,
                        comicInfo: { Series: 'Gantz', Number: '1' },
                        error: null,
                        publicationPath: 'Gantz/Gantz #01.cbz',
                    },
                ]);
            }
            throw new Error(`requête inattendue : ${url}`);
        });

        render(
            <MantineProvider>
                <MemoryRouter>
                    <DraftsPage />
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(await screen.findByText('Gantz')).toBeTruthy();
        // Jamais « aucun brouillon » pendant le chargement.
        expect(screen.queryByText('Aucun brouillon.')).toBeNull();

        fireEvent.click(screen.getByText('Gantz'));

        expect(await screen.findByText('→ #01')).toBeTruthy();
    });
});
