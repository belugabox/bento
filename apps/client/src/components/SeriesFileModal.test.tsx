import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type SeriesFileAction, SeriesFileModal } from './SeriesFileModal';

const respond = (body: unknown) =>
    new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });

let location = '';
const Where = () => {
    const current = useLocation();
    location = current.pathname + current.search;
    return null;
};

const renderModal = (action: SeriesFileAction) =>
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={['/series/4/edit']}>
                <Routes>
                    <Route
                        path="*"
                        element={
                            <>
                                <SeriesFileModal
                                    action={action}
                                    onClose={() => {}}
                                    seriesId={4}
                                    name="Gantz"
                                    volumeCount={2}
                                    size={2 * 1024 * 1024}
                                />
                                <Where />
                            </>
                        }
                    />
                </Routes>
            </MemoryRouter>
        </MantineProvider>,
    );

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SeriesFileModal', () => {
    it('puts the series back in the drafts, then opens its folder', async () => {
        const fetch = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(
                respond({ libraryId: 1, folder: '_draft/Gantz' }),
            );
        renderModal('draft');

        const dialog = await screen.findByRole('dialog');
        fireEvent.click(
            within(dialog).getByRole('button', {
                name: 'Remettre en brouillon',
            }),
        );

        await vi.waitFor(() =>
            expect(location).toBe('/drafts?library=1&folder=_draft%2FGantz'),
        );
        expect(String(fetch.mock.calls[0]![0])).toBe('/api/series/4/draft');
        expect(fetch.mock.calls[0]![1]?.method).toBe('POST');
    });

    it('deletes from the disk only once the name is typed', async () => {
        const fetch = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(respond({ deleted: 2, failures: [] }));
        renderModal('delete');

        const confirm = await screen.findByRole('button', {
            name: 'Supprimer 2 tomes',
        });
        expect(confirm.hasAttribute('disabled')).toBe(true);

        fireEvent.change(
            screen.getByLabelText('Pour confirmer, tape le nom de la série'),
            { target: { value: 'Gantz' } },
        );
        expect(confirm.hasAttribute('disabled')).toBe(false);
        fireEvent.click(confirm);

        await vi.waitFor(() => expect(location).toBe('/'));
        expect(String(fetch.mock.calls[0]![0])).toBe('/api/series/4/files');
        expect(fetch.mock.calls[0]![1]?.method).toBe('DELETE');
    });
});
