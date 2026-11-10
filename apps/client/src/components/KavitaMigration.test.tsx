import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KavitaMigration } from './KavitaMigration';

const ANALYSIS = {
    accounts: [
        {
            kavitaId: 1,
            name: 'Ben',
            maxAge: null,
            completed: 441,
            inProgress: 15,
            matched: 450,
            skipped: { volumes: 0, series: 0 },
            wantToRead: 0,
            sessions: {
                measured: 143,
                measuredHours: 65.8,
                estimated: 55,
                estimatedHours: 61.6,
            },
            suggestedUserId: 1,
        },
        {
            kavitaId: 2,
            name: 'Lucien',
            maxAge: 10,
            completed: 363,
            inProgress: 54,
            matched: 400,
            skipped: { volumes: 7, series: 1 },
            wantToRead: 0,
            sessions: {
                measured: 253,
                measuredHours: 111.1,
                estimated: 89,
                estimatedHours: 94,
            },
            suggestedUserId: null,
        },
    ],
    files: { total: 1926, matched: 1900, unmatched: ['Naruto/Disparu.cbz'] },
    olderDates: 1300,
};

let requests: [string, string, unknown][] = [];

beforeEach(() => {
    requests = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        requests.push([
            method,
            url,
            typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        ]);
        const body =
            url === '/api/users'
                ? [{ id: 1, name: 'Ben' }]
                : url.startsWith('/api/settings')
                  ? { settings: { ages: [0, 10, 12] } }
                  : url === '/api/migration/kavita/apply'
                    ? {
                          accountsCreated: 1,
                          progress: 800,
                          progressKept: 4,
                          toRead: 1,
                          addedDates: 1300,
                          sessions: 396,
                      }
                    : { analysis: ANALYSIS };
        return new Response(JSON.stringify(body), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

const show = () =>
    render(
        <MantineProvider>
            <MemoryRouter>
                <KavitaMigration />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('KavitaMigration', () => {
    it('proposes a choice for each account, then migrates', async () => {
        show();

        expect(
            await screen.findByText(
                '1 900 tomes de Kavita sur 1 926 retrouvés dans Bento.',
            ),
        ).toBeTruthy();
        // Ben : associé au compte du même nom ; Lucien : créé, 10 ans.
        expect(
            (
                (await screen.findByRole('textbox', {
                    name: 'Compte Bento pour Ben',
                })) as HTMLInputElement
            ).value,
        ).toBe('Associer à Ben');
        expect(
            (
                screen.getByRole('textbox', {
                    name: 'Compte Bento pour Lucien',
                }) as HTMLInputElement
            ).value,
        ).toBe('Créer « Lucien » (à activer)');
        expect(
            (
                screen.getByRole('textbox', {
                    name: 'Séries visibles pour Lucien',
                }) as HTMLInputElement
            ).value,
        ).toMatch(/10 ans/);
        // Tomes sautés : décochés par défaut.
        expect(
            (
                screen.getByRole('checkbox', {
                    name: /Tomes sautés marqués lus/,
                }) as HTMLInputElement
            ).checked,
        ).toBe(false);
        // Séances estimées : décochées par défaut.
        const estimated = screen.getByRole('checkbox', {
            name: /Avec les séances estimées/,
        }) as HTMLInputElement;
        expect(estimated.checked).toBe(false);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Migrer' }));
        });

        expect(requests).toContainEqual([
            'POST',
            '/api/migration/kavita/apply',
            {
                accounts: [
                    { kavitaId: 1, action: 'link', userId: 1 },
                    {
                        kavitaId: 2,
                        action: 'create',
                        name: 'Lucien',
                        maxAge: 10,
                    },
                ],
                addedDates: true,
                readingTime: true,
                estimatedSessions: false,
                fillGaps: false,
            },
        ]);
        expect(await screen.findByText('Migration faite')).toBeTruthy();
        expect(screen.getByText(/800 lectures reprises/)).toBeTruthy();
    });
});
