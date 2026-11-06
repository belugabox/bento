import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SeriesCardMenu, VolumeCardMenu } from './CardMenus';

// Requêtes envoyées : [méthode, adresse, corps].
let requests: [string, string, unknown][] = [];
const PREVIOUS = [{ volumeId: 11, progress: null }];

beforeEach(() => {
    requests = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        requests.push([init?.method ?? 'GET', url, body]);
        const response = url.endsWith('/read')
            ? { volumes: 1, read: true, previous: PREVIOUS }
            : url.endsWith('/progress')
              ? { progress: null, previous: PREVIOUS[0] }
              : url === '/api/series/3'
                ? {
                      id: 3,
                      volumes: [
                          { id: 11, number: '1', title: null, progress: null },
                          { id: 12, number: '2', title: null, progress: null },
                      ],
                  }
                : { restored: 1 };
        return new Response(JSON.stringify(response), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

let location = '';
const Location = () => {
    location = useLocation().pathname;
    return null;
};

const show = (menu: React.ReactNode) =>
    render(
        <MantineProvider>
            <Notifications />
            <MemoryRouter>
                {menu}
                <Location />
            </MemoryRouter>
        </MantineProvider>,
    );

const choose = async (button: string, item: string) => {
    fireEvent.click(screen.getByRole('button', { name: button }));
    await act(async () => {
        fireEvent.click(await screen.findByRole('menuitem', { name: item }));
    });
};

const SERIES = {
    id: 3,
    name: 'Gantz',
    volumeCount: 2,
    readCount: 0,
    startedCount: 0,
    toRead: false,
};

describe('SeriesCardMenu', () => {
    it('marks the series read, then undoes it', async () => {
        const onChanged = vi.fn();
        show(
            <SeriesCardMenu
                series={SERIES}
                isAdmin={false}
                onChanged={onChanged}
            />,
        );

        await choose('Actions pour Gantz', 'Marquer comme lue');
        expect(requests).toEqual([
            ['PUT', '/api/series/3/read', { read: true }],
        ]);
        expect(onChanged).toHaveBeenCalledTimes(1);
        expect(
            await screen.findByText('Série marquée comme lue.'),
        ).toBeTruthy();
        // Pas d'édition pour un lecteur, pas de « non lue » sans lecture.
        expect(screen.queryByText('Modifier la série')).toBeNull();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        });
        expect(requests[1]).toEqual([
            'PUT',
            '/api/progress/restore',
            { items: PREVIOUS },
        ]);
        await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
    });

    it('marks the series read up to a volume', async () => {
        show(<SeriesCardMenu series={SERIES} isAdmin onChanged={() => {}} />);

        await choose('Actions pour Gantz', 'Marquer lue jusqu’au tome…');
        fireEvent.click(
            await screen.findByRole('textbox', { name: 'Dernier tome lu' }),
        );
        fireEvent.click(await screen.findByRole('option', { name: 'Tome 2' }));
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Marquer comme lus' }),
            );
        });

        expect(requests.at(-1)).toEqual([
            'PUT',
            '/api/series/3/read',
            { read: true, upTo: 12 },
        ]);
    });

    it('opens the editor for an admin', async () => {
        show(<SeriesCardMenu series={SERIES} isAdmin onChanged={() => {}} />);

        await choose('Actions pour Gantz', 'Modifier la série');

        expect(location).toBe('/series/3/edit');
    });
});

describe('VolumeCardMenu', () => {
    const volume = {
        volumeId: 11,
        seriesId: 3,
        seriesName: 'Gantz',
        number: '1',
        title: null,
        page: 4,
    };

    it('takes a started volume out of the resume row', async () => {
        const onChanged = vi.fn();
        show(<VolumeCardMenu volume={volume} onChanged={onChanged} />);

        await choose('Actions pour Gantz, tome 1', 'Retirer de « Reprendre »');

        expect(requests).toEqual([
            ['PUT', '/api/volumes/11/progress', { completed: false }],
        ]);
        expect(onChanged).toHaveBeenCalled();
        expect(
            await screen.findByText('Gantz : tome 1 retiré de « Reprendre ».'),
        ).toBeTruthy();
    });

    it('goes to the series, and hides « Retirer » for a volume not opened', async () => {
        show(
            <VolumeCardMenu
                volume={{ ...volume, page: null }}
                onChanged={() => {}}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Actions pour Gantz, tome 1' }),
        );
        expect(
            await screen.findByRole('menuitem', {
                name: 'Marquer ce tome comme lu',
            }),
        ).toBeTruthy();
        expect(screen.queryByText('Retirer de « Reprendre »')).toBeNull();

        await act(async () => {
            fireEvent.click(
                screen.getByRole('menuitem', { name: 'Voir la série' }),
            );
        });
        expect(location).toBe('/series/3');
    });
});
