import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../src/db';
import { users } from '../src/db/schema';

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bento-db-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('openDatabase', () => {
    it('creates the file and its folder, then applies the migrations', () => {
        const file = path.join(dir, 'sub', 'bento.db');
        const { db, close } = openDatabase(file);

        db.insert(users)
            .values({ oidcSubject: 'abc', name: 'Admin', role: 'admin' })
            .run();
        const [user] = db.select().from(users).all();
        close();

        expect(user).toMatchObject({
            oidcSubject: 'abc',
            role: 'admin',
            maxAgeRating: null,
        });
        expect(user?.createdAt).toBeInstanceOf(Date);
    });

    it('keeps the data and reopens without migrating again', () => {
        const file = path.join(dir, 'bento.db');
        const first = openDatabase(file);
        first.db
            .insert(users)
            .values({ oidcSubject: 'abc', name: 'Admin', role: 'admin' })
            .run();
        first.close();

        const second = openDatabase(file);
        const count = second.db.select().from(users).all().length;
        second.close();

        expect(count).toBe(1);
    });
});
