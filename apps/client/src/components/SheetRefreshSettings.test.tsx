import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SheetRefreshSettings } from './SheetRefreshSettings';

const status = (changes: Record<string, unknown> = {}) => ({
    enabled: true,
    running: false,
    linked: 40,
    due: 12,
    toSearch: 3,
    proposed: 2,
    lastCheckedAt: null,
    lastError: null,
    pausedUntil: null,
    intervalMinutes: 10,
    night: { start: 2, end: 6 },
    ...changes,
});

let requests: [string, string][] = [];

beforeEach(() => {
    requests = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const method = init?.method ?? 'GET';
        requests.push([method, String(input)]);
        const body = method === 'POST' ? status({ running: true }) : status();
        return new Response(JSON.stringify(body), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SheetRefreshSettings', () => {
    it('shows the pace and the sheets left, and starts a pass now', async () => {
        render(
            <MantineProvider>
                <SheetRefreshSettings enabled minutes={10} onSaved={() => {}} />
            </MantineProvider>,
        );
        expect(
            await screen.findByText('12 fiches à relire sur 40.'),
        ).toBeTruthy();
        expect(screen.getByText(/Entre 2 h et 6 h/)).toBeTruthy();
        expect(
            screen.getByText(
                /3 recherches de fiche à faire · 2 fiches proposées dans Séries/,
            ),
        ).toBeTruthy();
        // Rythme : au plus 24 fiches par nuit à 10 minutes.
        expect(
            (
                screen.getByRole('textbox', {
                    name: 'Rythme',
                }) as HTMLInputElement
            ).value,
        ).toBe('Une fiche toutes les 10 minutes (par défaut)');
        expect(screen.getByText(/Au plus 24 fiches par nuit/)).toBeTruthy();

        fireEvent.click(
            screen.getByRole('button', { name: 'Lancer maintenant' }),
        );
        expect(
            await screen.findByRole('button', { name: 'Relecture en cours…' }),
        ).toBeTruthy();
        expect(requests).toContainEqual(['POST', '/api/metadata/refresh']);
    });
});
