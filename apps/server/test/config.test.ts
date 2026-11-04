import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadConfig as load } from '../src/config';

const OIDC = {
    OIDC_ISSUER: 'https://auth.example.com',
    OIDC_CLIENT_ID: 'bento',
    OIDC_CLIENT_SECRET: 'secret',
    PUBLIC_URL: 'https://bento.example.com/',
};

const loadConfig = (env: NodeJS.ProcessEnv) => load({ ...OIDC, ...env });

describe('loadConfig', () => {
    it('applies the defaults', () => {
        const config = loadConfig({});

        expect(config.PORT).toBe(3001);
        expect(config.LOG_LEVEL).toBe('info');
        expect(config.DATA_PATH).toBe(path.resolve('./data'));
        expect(config.DB_FILE).toBe(path.resolve('./data/bento.db'));
    });

    it('rejects an invalid value with a readable message', () => {
        expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(
            /Configuration invalide : LOG_LEVEL/,
        );
    });

    it('reads the libraries from JSON and resolves their paths', () => {
        const config = loadConfig({
            LIBRARIES: '[{"name":"Mangas","path":"./manga","type":"manga"}]',
        });

        expect(config.LIBRARIES).toEqual([
            { name: 'Mangas', path: path.resolve('./manga'), type: 'manga' },
        ]);
    });

    it('rejects malformed libraries', () => {
        expect(() => loadConfig({ LIBRARIES: '[{"name":' })).toThrow(
            /LIBRARIES : JSON invalide/,
        );
        expect(() =>
            loadConfig({
                LIBRARIES: '[{"name":"BD","path":"./bd","type":"bd"}]',
            }),
        ).toThrow(/LIBRARIES\.0\.type/);
    });

    it('requires the OIDC settings and trims the public URL', () => {
        expect(() => load({})).toThrow(/OIDC_ISSUER/);
        expect(loadConfig({})).toMatchObject({
            PUBLIC_URL: 'https://bento.example.com',
            OIDC_ADMIN_GROUP: 'bento-admins',
            OIDC_READER_GROUP: 'bento-readers',
        });
    });
});
