import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgesSettings } from './AgesSettings';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('AgesSettings', () => {
    it('saves the grid as soon as an age is added', async () => {
        const puts: unknown[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (_input, init) => {
                const body = JSON.parse(String(init?.body));
                puts.push(body);
                return new Response(
                    JSON.stringify({ settings: body, defaults: body }),
                    { headers: { 'Content-Type': 'application/json' } },
                );
            },
        );
        const onSaved = vi.fn();
        render(
            <MantineProvider>
                <AgesSettings ages={[0, 12]} onSaved={onSaved} />
            </MantineProvider>,
        );

        await act(async () => {
            fireEvent.click(screen.getByText('16+'));
        });

        expect(puts).toEqual([{ ages: [0, 12, 16] }]);
        expect(onSaved).toHaveBeenCalled();
    });
});
