import { describe, expect, it, vi } from 'vitest';

import { api, json } from './api';

const respond = (status: number, body: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );

describe('json', () => {
    it('returns the body of a successful call', async () => {
        const fetch = respond(200, { status: 'ok', version: '0.1.0' });

        expect(await json(api.health.$get())).toEqual({
            status: 'ok',
            version: '0.1.0',
        });
        expect(String(fetch.mock.calls[0]?.[0])).toMatch(/\/api\/health$/);
    });

    it('throws the message sent by the server', async () => {
        respond(403, { name: 'AppError', message: 'Accès refusé' });

        await expect(json(api.health.$get())).rejects.toThrow('Accès refusé');
    });
});
