import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SheetRefreshSettings } from './SheetRefreshSettings';

const status = (changes: Record<string, unknown> = {}) => ({
    enabled: true,
    running: false,
    linked: 40,
    due: 12,
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
                <SheetRefreshSettings enabled onSaved={() => {}} />
            </MantineProvider>,
        );
        expect(
            await screen.findByText('12 fiches à relire sur 40.'),
        ).toBeTruthy();
        expect(
            screen.getByText(
                /Une fiche toutes les 10 minutes, entre 2 h et 6 h/,
            ),
        ).toBeTruthy();

        fireEvent.click(
            screen.getByRole('button', { name: 'Lancer maintenant' }),
        );
        expect(
            await screen.findByRole('button', { name: 'Relecture en cours…' }),
        ).toBeTruthy();
        expect(requests).toContainEqual(['POST', '/api/metadata/refresh']);
    });
});
