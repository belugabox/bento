import AdmZip from 'adm-zip';
import { eq } from 'drizzle-orm';
import { access, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { users, volumes } from '../src/db/schema';
import { listSeries, setSeriesStatus } from '../src/library/catalog';
import { publicationPathOf } from '../src/library/paths';
import { getProgress, saveProgress } from '../src/library/progress';
import {
    authDeps,
    formatDrafts,
    png,
    sessionCookie,
    setup,
    silent,
    writeCbz,
} from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;

const ADMIN_VIEW = { id: 0, role: 'admin' as const, maxAge: null };

const info = (series: string, number: string, year?: number) =>
    `<Series>${series}</Series><Number>${number}</Number>${year ? `<Year>${year}</Year>` : ''}`;

const exists = (relative: string) =>
    access(ctx.file(relative)).then(
        () => true,
        () => false,
    );

const call = async (
    path: string,
    init: { method?: string; json?: unknown } = {},
    cookie = admin,
) => {
    const response = await api.request(path, {
        method: init.method ?? 'GET',
        headers: {
            Cookie: cookie,
            ...(init.json !== undefined && {
                'Content-Type': 'application/json',
            }),
        },
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
    const text = await response.text();
    return {
        status: response.status,
        body:
            text.startsWith('{') || text.startsWith('[')
                ? JSON.parse(text)
                : text,
    };
};

const volumeIdOf = (file: string) =>
    ctx.db
        .select({ id: volumes.id })
        .from(volumes)
        .where(eq(volumes.file, file))
        .get()?.id;

const readerId = () =>
    ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'reader'))
        .get()!.id;

beforeEach(async () => {
    ctx = await setup();
    api = createApi({
        db: ctx.db,
        logger: silent,
        version: '1.0.0',
        scanner: ctx.scanner,
        pages: ctx.pages,
        coversPath: ctx.coversPath,
        files: ctx.files,
        covers: ctx.covers,
        wikipedia: ctx.wikipedia,
        auth: authDeps(),
    });
    admin = sessionCookie(ctx.db, 'admin');
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('publicationPathOf', () => {
    it('builds Series/Series #NN (Year).cbz', () => {
        expect(
            publicationPathOf({
                Series: 'Spy x Family',
                Number: '1',
                Year: 2020,
            }),
        ).toBe('Spy x Family/Spy x Family #01 (2020).cbz');
        expect(publicationPathOf({ Series: 'Gantz', Number: '12.5' })).toBe(
            'Gantz/Gantz #12.5.cbz',
        );
        expect(publicationPathOf({ Series: 'One Piece', Number: '105' })).toBe(
            'One Piece/One Piece #105.cbz',
        );
    });

    it('needs a series and a number, and never makes subfolders', () => {
        expect(publicationPathOf({ Series: 'Gantz' })).toBeUndefined();
        expect(publicationPathOf({ Number: '1' })).toBeUndefined();
        expect(publicationPathOf({ Series: '../AC/DC.', Number: '1' })).toBe(
            '..-AC-DC/..-AC-DC #01.cbz',
        );
    });

    it('avoids characters Windows refuses in a folder name', () => {
        expect(
            publicationPathOf({
                Series: 'Fullmetal Alchemist: Brotherhood',
                Number: '1',
            }),
        ).toBe(
            'Fullmetal Alchemist - Brotherhood/Fullmetal Alchemist - Brotherhood #01.cbz',
        );
        expect(publicationPathOf({ Series: 'Re:Zero', Number: '1' })).toBe(
            'Re-Zero/Re-Zero #01.cbz',
        );
        expect(
            publicationPathOf({ Series: 'Who? "Me" <a|b>*', Number: '1' }),
        ).toBe("Who 'Me' -a-b-/Who 'Me' -a-b- #01.cbz");
    });
});

describe('drafts', () => {
    it('lists draft folders quickly, without reading the archives', async () => {
        await writeCbz(ctx.file('_draft/Gantz (01-18)/Gantz T01.cbz'));
        await writeFile(ctx.file('_draft/broken.cbz'), 'pas une archive');
        await writeFile(ctx.file('_draft/Spirale.cbr'), 'pas lu ici');
        await writeFile(ctx.file('_draft/notes.txt'), 'ignoré');

        const { status, body } = await call(
            `/libraries/${ctx.library.id}/drafts`,
        );

        expect(status).toBe(200);
        // Chaque tome à la racine de _draft forme son propre groupe.
        expect(body).toEqual([
            {
                folder: '_draft/broken.cbz',
                files: [
                    { path: '_draft/broken.cbz', name: 'broken.cbz', size: 15 },
                ],
                status: null,
                readingMode: null,
                formatId: null,
                age: null,
                coverUpdatedAt: null,
            },
            {
                folder: '_draft/Gantz (01-18)',
                files: [
                    expect.objectContaining({
                        path: '_draft/Gantz (01-18)/Gantz T01.cbz',
                    }),
                ],
                status: null,
                readingMode: null,
                formatId: null,
                age: null,
                coverUpdatedAt: null,
            },
            {
                // Nommé comme le .cbz qu'il deviendra.
                folder: '_draft/Spirale.cbz',
                files: [
                    {
                        path: '_draft/Spirale.cbr',
                        name: 'Spirale.cbr',
                        size: 10,
                    },
                ],
                status: null,
                readingMode: null,
                formatId: null,
                age: null,
                coverUpdatedAt: null,
            },
        ]);
    });

    it('reads one folder with its ComicInfo and problems', async () => {
        await writeCbz(ctx.file('_draft/Gantz (01-18)/Gantz T01.cbz'), {
            comicInfo: info('Gantz', '1'),
        });
        await writeCbz(ctx.file('_draft/Gantz (01-18)/Gantz T02.cbz'));
        await writeFile(ctx.file('_draft/broken.cbz'), 'pas une archive');
        // Un .cbr qui est en fait un ZIP : converti au passage.
        const zip = new AdmZip();
        zip.addFile('p1.png', await png('#ff0000'));
        await writeFile(ctx.file('_draft/Spirale.cbr'), zip.toBuffer());
        const folder = (name: string) =>
            call(
                `/libraries/${ctx.library.id}/drafts/files?folder=${encodeURIComponent(name)}`,
            );

        const root = (await folder('_draft')).body;
        expect(
            root.map((f: { name: string; error: string | null }) => [
                f.name,
                f.error,
            ]),
        ).toEqual([
            ['broken.cbz', "Archive illisible : ce n'est pas une archive ZIP"],
            ['Spirale.cbz', null],
        ]);

        // Un tome seul à la racine (le .cbr est converti au passage).
        expect(
            (await folder('_draft/broken.cbz')).body.map(
                (f: { name: string }) => f.name,
            ),
        ).toEqual(['broken.cbz']);
        await writeFile(ctx.file('_draft/Seul.cbr'), zip.toBuffer());
        expect((await folder('_draft/Seul.cbr')).body).toEqual([
            expect.objectContaining({ name: 'Seul.cbz', error: null }),
        ]);

        const gantz = (await folder('_draft/Gantz (01-18)')).body;
        expect(gantz[0]).toMatchObject({
            name: 'Gantz T01.cbz',
            draft: true,
            pageCount: 2,
            comicInfo: { Series: 'Gantz', Number: '1' },
            publicationPath: 'Gantz/Gantz #01.cbz',
        });
        expect(gantz[1].publicationPath).toBeNull();

        // Seulement des dossiers de brouillons.
        expect((await folder('Gantz')).status).toBe(404);
        expect((await folder('_draft/../Gantz')).status).toBe(404);
        expect((await folder('_draft/../..')).status).toBe(404);
    });

    it('serves the cover and pages of a draft', async () => {
        await writeCbz(ctx.file('_draft/Gantz T01.cbz'));
        const base = `/libraries/${ctx.library.id}/files`;
        const query = `?path=${encodeURIComponent('_draft/Gantz T01.cbz')}`;

        const cover = await api.request(`${base}/cover${query}`, {
            headers: { Cookie: admin },
        });
        expect(cover.status).toBe(200);
        expect(cover.headers.get('content-type')).toBe('image/webp');
        const page = await api.request(`${base}/pages/1${query}`, {
            headers: { Cookie: admin },
        });
        expect(page.headers.get('content-type')).toBe('image/png');
        const sizes = await call(`${base}/page-sizes${query}`);
        expect(sizes.body).toHaveLength(2);
        expect(sizes.body[0]).toEqual([expect.any(Number), expect.any(Number)]);
    });

    it('is for admins, and stays inside the library', async () => {
        const reader = sessionCookie(ctx.db, 'reader');
        expect(
            (await call(`/libraries/${ctx.library.id}/drafts`, {}, reader))
                .status,
        ).toBe(403);
        expect(
            (
                await call(
                    `/libraries/${ctx.library.id}/files/info?path=${encodeURIComponent('../secret.cbz')}`,
                )
            ).status,
        ).toBe(400);
    });
});

describe('ComicInfo editing', () => {
    it('saves each file, and reports failures without stopping', async () => {
        await writeCbz(ctx.file('_draft/T01.cbz'), {
            comicInfo: info('Gantz', '1'),
        });
        await writeFile(ctx.file('_draft/broken.cbz'), 'pas une archive');

        const { body } = await call(
            `/libraries/${ctx.library.id}/files/comic-info`,
            {
                method: 'PUT',
                json: {
                    updates: [
                        { path: '_draft/broken.cbz', changes: { Series: 'X' } },
                        {
                            path: '_draft/T01.cbz',
                            changes: { Year: 2017, Number: null },
                        },
                    ],
                },
            },
        );

        expect(body.failures).toEqual([
            expect.objectContaining({ path: '_draft/broken.cbz' }),
        ]);
        expect(body.updated[0].comicInfo).toEqual({
            Series: 'Gantz',
            Year: 2017,
        });
    });

    it('checks the fields and their types', async () => {
        const update = (changes: unknown) =>
            call(`/libraries/${ctx.library.id}/files/comic-info`, {
                method: 'PUT',
                json: { updates: [{ path: '_draft/T01.cbz', changes }] },
            });
        expect((await update({ Unknown: 'x' })).status).toBe(400);
        expect((await update({ Year: '2017' })).status).toBe(400);
        expect((await update({ Number: 12 })).status).toBe(400);
    });

    it('refreshes the library when a published volume changes', async () => {
        await writeCbz(ctx.file('Gantz/Gantz #01.cbz'), {
            comicInfo: info('Gantz', '1'),
        });
        await ctx.scanner.scan(ctx.library.id);

        await ctx.files.updateComicInfo(ctx.library.id, [
            {
                path: 'Gantz/Gantz #01.cbz',
                changes: { Summary: 'Des aliens.' },
            },
        ]);

        const series = listSeries(ctx.db, ADMIN_VIEW);
        expect(series[0]).toMatchObject({ name: 'Gantz' });
        const details = await call(`/series/${series[0]!.id}`);
        expect(details.body.summary).toBe('Des aliens.');
        // L'admin reçoit le chemin de chaque tome.
        expect(details.body.volumes[0].admin).toEqual({
            file: 'Gantz/Gantz #01.cbz',
            comicInfo: { Series: 'Gantz', Number: '1', Summary: 'Des aliens.' },
            publicationPath: 'Gantz/Gantz #01.cbz',
        });
        const reader = sessionCookie(ctx.db, 'reader');
        const forReader = await call(`/series/${series[0]!.id}`, {}, reader);
        expect(forReader.body.volumes[0].admin).toBeNull();
    });
});

describe('publishing', () => {
    it('moves a draft to Series/Series #NN and indexes it', async () => {
        await writeCbz(ctx.file('_draft/Gantz (01-18)/Gantz T01.cbz'), {
            comicInfo: info('Gantz', '1', 2017),
        });

        await formatDrafts(ctx);
        const { body } = await call(
            `/libraries/${ctx.library.id}/files/publish`,
            {
                method: 'POST',
                json: { paths: ['_draft/Gantz (01-18)/Gantz T01.cbz'] },
            },
        );

        expect(body).toEqual({
            published: [
                {
                    from: '_draft/Gantz (01-18)/Gantz T01.cbz',
                    to: 'Gantz/Gantz #01 (2017).cbz',
                },
            ],
            failures: [],
        });
        expect(await exists('Gantz/Gantz #01 (2017).cbz')).toBe(true);
        // Dossier du brouillon vidé : supprimé ; _draft reste.
        expect(await readdir(ctx.file('_draft'))).toEqual([]);
        expect(listSeries(ctx.db, ADMIN_VIEW).map((s) => s.name)).toEqual([
            'Gantz',
        ]);
    });

    it('applies the settings of a lone volume at the root of _draft', async () => {
        await writeCbz(ctx.file('_draft/Spirale.cbz'), {
            comicInfo: info('Spirale', '1'),
        });
        await writeCbz(ctx.file('_draft/Gantz.cbz'), {
            comicInfo: info('Gantz', '1'),
        });
        ctx.files.setDraftSettings(ctx.library.id, '_draft/Spirale.cbz', {
            status: 'completed',
        });

        await formatDrafts(ctx);
        await ctx.files.publish(ctx.library.id, [
            '_draft/Spirale.cbz',
            '_draft/Gantz.cbz',
        ]);

        const statuses = Object.fromEntries(
            listSeries(ctx.db, ADMIN_VIEW).map((s) => [s.name, s.status]),
        );
        expect(statuses).toEqual({ Gantz: null, Spirale: 'completed' });
    });

    it('reads a draft folder whose name ends with .cbz as a folder', async () => {
        await writeCbz(ctx.file('_draft/Gantz.cbz/Gantz T01.cbz'));

        const files = await ctx.files.draftFolder(
            ctx.library.id,
            '_draft/Gantz.cbz',
        );

        expect(files.map((file) => file.path)).toEqual([
            '_draft/Gantz.cbz/Gantz T01.cbz',
        ]);
    });

    it('keeps the settings of a lone .cbr once converted', async () => {
        // Un .cbr qui est en fait un ZIP : converti à l'ouverture.
        await writeCbz(ctx.file('_draft/Seul.cbr'), {
            comicInfo: info('Seul', '1'),
        });
        const [draft] = await ctx.files.drafts(ctx.library.id);
        ctx.files.setDraftSettings(ctx.library.id, draft!.folder, {
            status: 'completed',
        });

        const files = await ctx.files.draftFolder(
            ctx.library.id,
            draft!.folder,
        );
        await formatDrafts(ctx);
        await ctx.files.publish(
            ctx.library.id,
            files.map((file) => file.path),
        );

        expect(files.map((file) => file.path)).toEqual(['_draft/Seul.cbz']);
        expect(listSeries(ctx.db, ADMIN_VIEW)).toEqual([
            expect.objectContaining({ name: 'Seul', status: 'completed' }),
        ]);
    });

    it('adds drafts to a published series whose folder is named otherwise', async () => {
        await writeCbz(ctx.file('Boxer (The)/T01.cbz'), {
            comicInfo: info('The Boxer', '1'),
        });
        await ctx.scanner.scan(ctx.library.id);
        await writeCbz(ctx.file('_draft/Boxer/T02.cbz'), {
            comicInfo: info('the boxer', '2'),
        });

        await formatDrafts(ctx);
        const { published } = await ctx.files.publish(ctx.library.id, [
            '_draft/Boxer/T02.cbz',
        ]);

        expect(published[0]?.to).toBe('Boxer (The)/the boxer #02.cbz');
        expect(listSeries(ctx.db, ADMIN_VIEW)).toEqual([
            expect.objectContaining({ name: 'The Boxer', volumeCount: 2 }),
        ]);
    });

    it('applies the status chosen on the draft folder to the series', async () => {
        await writeCbz(ctx.file('_draft/Gantz/T01.cbz'), {
            comicInfo: info('Gantz', '1'),
        });
        const set = await call(`/libraries/${ctx.library.id}/drafts/status`, {
            method: 'PUT',
            json: { folder: '_draft/Gantz', status: 'completed' },
        });
        expect(set.body).toEqual({ status: 'completed' });
        const drafts = await call(`/libraries/${ctx.library.id}/drafts`);
        expect(drafts.body[0].status).toBe('completed');

        await formatDrafts(ctx);
        await ctx.files.publish(ctx.library.id, ['_draft/Gantz/T01.cbz']);

        expect(listSeries(ctx.db, ADMIN_VIEW)[0]?.status).toBe('completed');
        // Dossier vidé : son statut est oublié.
        expect(
            (await call(`/libraries/${ctx.library.id}/drafts`)).body,
        ).toEqual([]);
        expect(
            ctx.files.setDraftSettings(ctx.library.id, '_draft/Gantz', {
                status: null,
            }),
        ).toEqual({
            status: null,
            readingMode: null,
            formatId: null,
            age: null,
            coverUpdatedAt: null,
        });
    });

    it('applies the reading mode and cover chosen on the draft folder', async () => {
        await writeCbz(ctx.file('_draft/Boxer/T01.cbz'), {
            pages: 2,
            comicInfo: info('Boxer', '1'),
        });
        await writeCbz(ctx.file('_draft/Boxer/T02.cbz'), {
            comicInfo: info('Boxer', '2'),
        });
        const drafts = `/libraries/${ctx.library.id}/drafts`;
        const mode = await call(`${drafts}/reading-mode`, {
            method: 'PUT',
            json: { folder: '_draft/Boxer', readingMode: 'webtoon' },
        });
        expect(mode.body).toEqual({ readingMode: 'webtoon' });
        const folder = encodeURIComponent('_draft/Boxer');
        const cover = await call(`${drafts}/cover?folder=${folder}`, {
            method: 'PUT',
            json: {
                type: 'file',
                path: '_draft/Boxer/T01.cbz',
                page: 1,
                position: 'center',
            },
        });
        expect(cover.status).toBe(200);
        const listed = (await call(drafts)).body[0];
        expect(listed.readingMode).toBe('webtoon');
        expect(listed.coverUpdatedAt).toEqual(expect.any(String));
        const draftCover = await api.request(
            `${drafts}/cover?folder=${folder}`,
            { headers: { Cookie: admin } },
        );
        expect(draftCover.status).toBe(200);
        const draftBytes = Buffer.from(await draftCover.arrayBuffer());

        await formatDrafts(ctx);
        await ctx.files.publish(ctx.library.id, [
            '_draft/Boxer/T01.cbz',
            '_draft/Boxer/T02.cbz',
        ]);

        const [published] = listSeries(ctx.db, ADMIN_VIEW);
        expect(published?.coverUpdatedAt).not.toBeNull();
        expect((await call(`/series/${published!.id}`)).body.readingMode).toBe(
            'webtoon',
        );
        const seriesCover = await api.request(
            `/series/${published!.id}/cover`,
            { headers: { Cookie: admin } },
        );
        expect(Buffer.from(await seriesCover.arrayBuffer())).toEqual(
            draftBytes,
        );
        // Dossier vidé : sa couverture est oubliée.
        expect(
            (
                await api.request(`${drafts}/cover?folder=${folder}`, {
                    headers: { Cookie: admin },
                })
            ).status,
        ).toBe(404);
    });

    it('takes a draft cover only from a file of the folder', async () => {
        await writeCbz(ctx.file('_draft/Boxer/T01.cbz'));
        await writeCbz(ctx.file('_draft/Gantz/T01.cbz'));
        const put = (folder: string, json: unknown) =>
            call(
                `/libraries/${ctx.library.id}/drafts/cover?folder=${encodeURIComponent(folder)}`,
                { method: 'PUT', json },
            );
        expect(
            (
                await put('_draft/Boxer', {
                    type: 'file',
                    path: '_draft/Gantz/T01.cbz',
                })
            ).status,
        ).toBe(400);
        expect(
            (
                await put('_draft/../Gantz', {
                    type: 'file',
                    path: '_draft/../Gantz/x.cbz',
                })
            ).status,
        ).toBe(404);
        expect((await put('_draft/Boxer', { type: 'default' })).status).toBe(
            200,
        );
    });

    it('keeps draft statuses for admins and draft folders', async () => {
        const reader = sessionCookie(ctx.db, 'reader');
        const put = (json: unknown, cookie = admin) =>
            call(
                `/libraries/${ctx.library.id}/drafts/status`,
                { method: 'PUT', json },
                cookie,
            );
        expect(
            (await put({ folder: '_draft/X', status: 'ongoing' }, reader))
                .status,
        ).toBe(403);
        expect((await put({ folder: 'Gantz', status: 'ongoing' })).status).toBe(
            404,
        );
        expect(
            (await put({ folder: '_draft/../Gantz', status: 'ongoing' }))
                .status,
        ).toBe(404);
        expect((await put({ folder: '_draft/X', status: 'done' })).status).toBe(
            400,
        );
    });

    it('needs a series and a number', async () => {
        await writeCbz(ctx.file('_draft/T01.cbz'));

        await formatDrafts(ctx);
        const { failures } = await ctx.files.publish(ctx.library.id, [
            '_draft/T01.cbz',
        ]);

        expect(failures[0]?.reason).toMatch(/série et le numéro/);
        expect(await exists('_draft/T01.cbz')).toBe(true);
    });

    it('replaces the published volume of the same number, keeping reading progress', async () => {
        await writeCbz(ctx.file('Gantz/Gantz #01.cbz'), {
            pages: 3,
            comicInfo: info('Gantz', '1'),
        });
        await ctx.scanner.scan(ctx.library.id);
        const id = volumeIdOf('Gantz/Gantz #01.cbz')!;
        sessionCookie(ctx.db, 'reader');
        saveProgress(ctx.db, readerId(), id, { page: 1 });

        await writeCbz(ctx.file('_draft/Gantz T01 HD.cbz'), {
            pages: 4,
            comicInfo: info('Gantz', '1', 2017),
        });
        await formatDrafts(ctx);
        await ctx.files.publish(ctx.library.id, ['_draft/Gantz T01 HD.cbz']);

        expect(await readdir(ctx.file('Gantz'))).toEqual([
            'Gantz #01 (2017).cbz',
        ]);
        expect(volumeIdOf('Gantz/Gantz #01 (2017).cbz')).toBe(id);
        expect(getProgress(ctx.db, readerId(), id)).toEqual({
            page: 1,
            completed: false,
        });
        const row = ctx.db
            .select()
            .from(volumes)
            .where(eq(volumes.id, id))
            .get();
        expect(row?.pageCount).toBe(4);
    });

    it('moves a published series when renamed, keeping ids and progress', async () => {
        for (const n of ['1', '2']) {
            await writeCbz(ctx.file(`Spy X Family/Spy X Family #0${n}.cbz`), {
                comicInfo: info('Spy X Family', n),
            });
        }
        await ctx.scanner.scan(ctx.library.id);
        const id = volumeIdOf('Spy X Family/Spy X Family #01.cbz')!;
        sessionCookie(ctx.db, 'reader');
        saveProgress(ctx.db, readerId(), id, { completed: true });
        const oldSeries = listSeries(ctx.db, ADMIN_VIEW)[0]!;
        setSeriesStatus(ctx.db, oldSeries.id, 'completed');
        const paths = [
            'Spy X Family/Spy X Family #01.cbz',
            'Spy X Family/Spy X Family #02.cbz',
        ];

        await ctx.files.updateComicInfo(
            ctx.library.id,
            paths.map((p) => ({
                path: p,
                changes: { Series: 'Spy x Family' },
            })),
        );
        await formatDrafts(ctx);
        const { published, failures } = await ctx.files.publish(
            ctx.library.id,
            paths,
        );

        expect(failures).toEqual([]);
        expect(published.map((p) => p.to)).toEqual([
            'Spy x Family/Spy x Family #01.cbz',
            'Spy x Family/Spy x Family #02.cbz',
        ]);
        expect(volumeIdOf('Spy x Family/Spy x Family #01.cbz')).toBe(id);
        expect(getProgress(ctx.db, readerId(), id)).toMatchObject({
            completed: true,
        });
        expect(
            listSeries(ctx.db, ADMIN_VIEW).map((s) => [s.name, s.volumeCount]),
        ).toEqual([['Spy x Family', 2]]);
        // La série renommée garde son statut.
        expect(listSeries(ctx.db, ADMIN_VIEW)[0]?.status).toBe('completed');
    });

    it('never overwrites another published volume when moving', async () => {
        await writeCbz(ctx.file('Gantz/Gantz #01.cbz'), {
            comicInfo: info('Gantz', '1'),
        });
        await writeCbz(ctx.file('Gantz/Gantz bonus.cbz'), {
            comicInfo: info('Gantz', '1'),
        });

        await formatDrafts(ctx);
        const { failures } = await ctx.files.publish(ctx.library.id, [
            'Gantz/Gantz bonus.cbz',
        ]);

        expect(failures[0]).toMatchObject({
            path: 'Gantz/Gantz bonus.cbz',
            reason: expect.stringMatching(/existe déjà : Gantz #01.cbz/),
        });
        expect(await exists('Gantz/Gantz bonus.cbz')).toBe(true);
    });

    it('keeps the series folder inside the library', async () => {
        await writeCbz(ctx.file('_draft/T01.cbz'), {
            comicInfo: info('../../evil', '1'),
        });

        await formatDrafts(ctx);
        const { published } = await ctx.files.publish(ctx.library.id, [
            '_draft/T01.cbz',
        ]);

        expect(published[0]?.to).toBe('..-..-evil/..-..-evil #01.cbz');
        expect(
            path
                .resolve(ctx.file(published[0]!.to))
                .startsWith(path.resolve(ctx.root)),
        ).toBe(true);
    });
});
