import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompressionModal } from './CompressionModal';

const files = [
    { path: '_draft/Gantz/T01.cbz', name: 'T01.cbz' },
    { path: '_draft/Gantz/T02.cbz', name: 'T02.cbz' },
];

const job = (path: string, state: string, extra = {}) => ({
    libraryId: 1,
    path,
    state,
    ...extra,
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('CompressionModal', () => {
    it('estimates the gain, then follows the compression on the server', async () => {
        // État de la file renvoyé par le serveur, au fil des appels.
        let queue: unknown[] = [];
        const requests: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                const url = String(input);
                const method = init?.method ?? 'GET';
                requests.push(`${method} ${url}`);
                let body: unknown;
                if (url.endsWith('/compression/estimate')) {
                    body = { originalSize: 1000, compressedSize: 600 };
                } else if (url.endsWith('/compress')) {
                    queue = files.map((f) => job(f.path, 'pending'));
                    body = { jobs: queue };
                } else {
                    body = { jobs: queue };
                    // Après le premier suivi : tout est compressé.
                    if (queue.length) {
                        queue = files.map((f) =>
                            job(f.path, 'done', {
                                originalSize: 1000,
                                compressedSize: 500,
                            }),
                        );
                    }
                }
                return new Response(JSON.stringify(body), {
                    headers: { 'Content-Type': 'application/json' },
                });
            },
        );
        const onCompressed = vi.fn();
        render(
            <MantineProvider>
                <CompressionModal
                    opened
                    onClose={() => {}}
                    libraryId={1}
                    files={files}
                    onCompressed={onCompressed}
                />
            </MantineProvider>,
        );

        await act(async () => {
            fireEvent.click(await screen.findByText('Estimer le gain'));
        });
        await vi.waitFor(() =>
            expect(screen.getAllByText('−40 %')).toHaveLength(2),
        );
        expect(screen.getByText(/^Estimation :/).textContent).toMatch(/−40 %/);

        await act(async () => {
            fireEvent.click(screen.getByText('Compresser (2)'));
        });
        expect(requests).toContain('POST /api/libraries/1/files/compress');

        await vi.waitFor(
            () => expect(screen.getByText(/^Compressés :/)).toBeTruthy(),
            { timeout: 5000 },
        );
        expect(screen.getByText(/^Compressés :/).textContent).toMatch(/−50 %/);
        await vi.waitFor(() => expect(onCompressed).toHaveBeenCalledTimes(1));
    });
});
