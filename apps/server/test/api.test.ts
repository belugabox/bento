import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { openDatabase } from '../src/db';

const silent = pino({ level: 'silent' });
let database: ReturnType<typeof openDatabase>;

const api = () => {
    database = openDatabase(':memory:');
    return createApi({ db: database.db, logger: silent, version: '1.2.3' });
};

afterEach(() => database?.close());

describe('GET /health', () => {
    it('reports the server as up with its version', async () => {
        const response = await api().request('/health');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            status: 'ok',
            version: '1.2.3',
        });
    });
});

describe('error handling', () => {
    it('hides internal errors behind a generic 500', async () => {
        const app = api().get('/boom', () => {
            throw new Error('secret internal detail');
        });

        const response = await app.request('/boom');

        expect(response.status).toBe(500);
        const body = await response.text();
        expect(body).toContain('Erreur interne du serveur');
        expect(body).not.toContain('secret');
    });
});
