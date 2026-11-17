import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { series, volumes } from '../src/db/schema';
import { LibraryScanner } from '../src/library/scanner';
import { setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
    ctx = await setup();
    await writeCbz(ctx.file('Gantz/Gantz T01.cbz'));
    await ctx.scanner.scan(ctx.library.id);
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('library files absent (copy of the production)', () => {
    it('never scans, so nothing is removed', async () => {
        // Les fichiers manquent (copie de la base seulement).
        await rm(ctx.file('Gantz/Gantz T01.cbz'));
        const scanner = new LibraryScanner(
            ctx.db,
            ctx.coversPath,
            silent,
            undefined,
            true,
        );

        expect(await scanner.scan(ctx.library.id)).toEqual({
            added: 0,
            updated: 0,
            removed: 0,
            errors: [],
        });
        expect(ctx.db.select().from(series).all()).toHaveLength(1);
        expect(ctx.db.select().from(volumes).all()).toHaveLength(1);
    });
});
