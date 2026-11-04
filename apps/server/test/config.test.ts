import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';

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
});
