import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SOURCE_PRIORITY } from '@server/types';

import { SourcePrioritySettings } from './SourcePrioritySettings';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SourcePrioritySettings', () => {
    it('saves the site chosen for a field as soon as it changes', async () => {
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
                <SourcePrioritySettings
                    priority={DEFAULT_SOURCE_PRIORITY}
                    onSaved={onSaved}
                />
            </MantineProvider>,
        );

        await act(async () => {
            fireEvent.click(
                within(
                    screen.getByRole('radiogroup', {
                        name: 'Site préféré : Scénario',
                    }),
                ).getByLabelText('Wikipédia'),
            );
        });

        expect(puts).toEqual([{ sourcePriority: { Writer: 'wikipedia' } }]);
        expect(onSaved).toHaveBeenCalled();
    });
});
