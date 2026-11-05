import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionsPage } from './CollectionsPage';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('CollectionsPage', () => {
    it('creates, renames and deletes collections', async () => {
        let collections = [{ id: 1, name: 'Classiques', seriesCount: 2 }];
        const requests: [string, string, unknown][] = [];
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                const method = init?.method ?? 'GET';
                const body = init?.body
                    ? JSON.parse(String(init.body))
                    : undefined;
                requests.push([method, String(input), body]);
                let response: unknown = collections;
                if (method === 'POST') {
                    response = { id: 2, name: body.name };
                    collections = [
                        ...collections,
                        { id: 2, name: body.name, seriesCount: 0 },
                    ];
                } else if (method === 'PATCH') {
                    collections = collections.map((c) =>
                        c.id === 1 ? { ...c, name: body.name } : c,
                    );
                    response = { id: 1, name: body.name };
                } else if (method === 'DELETE') {
                    collections = collections.filter((c) => c.id !== 2);
                    response = { id: 2 };
                }
                return new Response(JSON.stringify(response), {
                    headers: { 'Content-Type': 'application/json' },
                });
            },
        );

        render(
            <MantineProvider>
                <MemoryRouter>
                    <CollectionsPage />
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(await screen.findByText('2 séries')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Nouvelle collection'), {
            target: { value: 'Pour les enfants' },
        });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
        });
        expect(requests).toContainEqual([
            'POST',
            '/api/collections',
            { name: 'Pour les enfants' },
        ]);
        expect(await screen.findByText('0 série')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Nom de Classiques'), {
            target: { value: 'Grands classiques' },
        });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Renommer' }));
        });
        expect(requests).toContainEqual([
            'PATCH',
            '/api/collections/1',
            { name: 'Grands classiques' },
        ]);

        await act(async () => {
            fireEvent.click(
                await screen.findByRole('button', {
                    name: 'Supprimer Pour les enfants',
                }),
            );
        });
        expect(requests).toContainEqual([
            'DELETE',
            '/api/collections/2',
            undefined,
        ]);
        await vi.waitFor(() =>
            expect(screen.queryByText('0 série')).toBeNull(),
        );
    });
});
