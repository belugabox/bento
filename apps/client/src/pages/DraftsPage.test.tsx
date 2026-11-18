import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DraftsPage } from './DraftsPage';

/** Une action du menu « ⋯ » de l'éditeur. */
const menuAction = async (name: string) => {
    fireEvent.click(
        await screen.findByRole('button', { name: 'Plus d’actions' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name }));
};

const respond = (body: unknown) =>
    new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });

afterEach(() => {
    vi.restoreAllMocks();
});

describe('DraftsPage', () => {
    it('lists the draft folders, then opens one with its volumes', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            if (url === '/api/libraries') {
                return respond([{ id: 1, name: 'Mangas', type: 'manga' }]);
            }
            if (url === '/api/libraries/1/drafts') {
                return respond([
                    {
                        folder: '_draft/Gantz',
                        files: [
                            {
                                path: '_draft/Gantz/T01.cbz',
                                name: 'T01.cbz',
                                size: 10,
                            },
                        ],
                        completeness: {
                            percent: 41,
                            missing: ['Format', 'Résumé'],
                        },
                    },
                ]);
            }
            if (
                url.startsWith(
                    '/api/libraries/1/drafts/files?folder=_draft%2FGantz',
                )
            ) {
                return respond([
                    {
                        path: '_draft/Gantz/T01.cbz',
                        name: 'T01.cbz',
                        folder: '_draft/Gantz',
                        size: 10,
                        draft: true,
                        pageCount: 2,
                        comicInfo: { Series: 'Gantz', Number: '1' },
                        error: null,
                        publicationPath: 'Gantz/Gantz #01.cbz',
                    },
                ]);
            }
            throw new Error(`requête inattendue : ${url}`);
        });

        render(
            <MantineProvider>
                <MemoryRouter>
                    <DraftsPage />
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(await screen.findByText('Gantz')).toBeTruthy();
        // Jamais « aucun brouillon » pendant le chargement.
        expect(screen.queryByText('Aucun brouillon.')).toBeNull();
        // La fiche de la future série, rappelée dans la liste.
        expect(
            screen
                .getByLabelText('Fiche complète à 41 %')
                .getAttribute('title'),
        ).toBe('À compléter : Format, Résumé');

        fireEvent.click(screen.getByText('Gantz'));

        expect(await screen.findByText('→ #01')).toBeTruthy();
    });

    it('waits for the PDF conversion, then opens the editor', async () => {
        let folderReads = 0;
        const file = (converting: boolean) => ({
            path: `_draft/Inuyashiki/Tome 01.${converting ? 'pdf' : 'cbz'}`,
            name: `Tome 01.${converting ? 'pdf' : 'cbz'}`,
            folder: '_draft/Inuyashiki',
            size: 10,
            draft: true,
            pageCount: converting ? 0 : 2,
            comicInfo: converting ? {} : { Series: 'Inuyashiki', Number: '1' },
            error: converting ? 'Conversion du PDF en cours…' : null,
            ...(converting && { converting: true }),
            publicationPath: converting
                ? null
                : 'Inuyashiki/Inuyashiki #01.cbz',
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            if (url === '/api/libraries') {
                return respond([{ id: 1, name: 'Mangas', type: 'manga' }]);
            }
            if (url === '/api/libraries/1/drafts') {
                return respond([
                    {
                        folder: '_draft/Inuyashiki',
                        files: [
                            {
                                path: '_draft/Inuyashiki/Tome 01.pdf',
                                name: 'Tome 01.pdf',
                                size: 10,
                            },
                        ],
                    },
                ]);
            }
            if (url.startsWith('/api/libraries/1/drafts/files?')) {
                folderReads++;
                return respond([file(folderReads === 1)]);
            }
            throw new Error(`requête inattendue : ${url}`);
        });

        render(
            <MantineProvider>
                <MemoryRouter>
                    <DraftsPage />
                </MemoryRouter>
            </MantineProvider>,
        );
        fireEvent.click(await screen.findByText('Inuyashiki'));

        expect(
            await screen.findByText('Conversion des PDF en CBZ…'),
        ).toBeTruthy();
        expect(screen.getByText(/0 \/ 1 fichiers prêts/)).toBeTruthy();
        // Relu tout seul : l'éditeur s'ouvre une fois le PDF converti.
        expect(
            await screen.findByText('→ #01', undefined, { timeout: 5000 }),
        ).toBeTruthy();
        expect(folderReads).toBe(2);
    });

    it('keeps archived drafts under a folded list, opened from the address', async () => {
        const archived: Record<string, boolean> = { '_draft/Spirale': true };
        const sent: unknown[] = [];
        const draft = (name: string) => ({
            folder: `_draft/${name}`,
            files: [
                { path: `_draft/${name}/T01.cbz`, name: 'T01.cbz', size: 10 },
            ],
            archivedAt: archived[`_draft/${name}`] ? 1700000000000 : null,
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                const url = String(input);
                if (url === '/api/libraries') {
                    return respond([{ id: 1, name: 'Mangas', type: 'manga' }]);
                }
                if (url === '/api/libraries/1/drafts/archive') {
                    const body = JSON.parse(String(init!.body));
                    sent.push(body);
                    archived[body.folder] = body.archived;
                    return respond({ archived: body.archived });
                }
                if (url === '/api/libraries/1/drafts') {
                    return respond([draft('Gantz'), draft('Spirale')]);
                }
                if (url.startsWith('/api/libraries/1/drafts/files?')) {
                    const folder = new URL(url, 'http://x').searchParams.get(
                        'folder',
                    )!;
                    return respond([
                        {
                            path: `${folder}/T01.cbz`,
                            name: 'T01.cbz',
                            folder,
                            size: 10,
                            draft: true,
                            pageCount: 2,
                            comicInfo: { Series: 'X', Number: '1' },
                            error: null,
                            publicationPath: 'X/X #01.cbz',
                        },
                    ]);
                }
                throw new Error(`requête inattendue : ${url}`);
            },
        );

        render(
            <MantineProvider>
                <MemoryRouter
                    initialEntries={[
                        '/drafts?library=1&folder=_draft%2FSpirale',
                    ]}
                >
                    <DraftsPage />
                </MemoryRouter>
            </MantineProvider>,
        );

        // Le dossier de l'adresse, ouvert ; sa liste repliée, dépliée.
        expect(
            await screen.findByRole('button', { name: /Archivés \(1\)/ }),
        ).toBeTruthy();

        await menuAction('Remettre en attente');
        await vi.waitFor(() =>
            expect(
                screen.queryByRole('button', { name: /Archivés/ }),
            ).toBeNull(),
        );
        expect(sent).toEqual([{ folder: '_draft/Spirale', archived: false }]);

        // Et de nouveau archivé.
        await menuAction('Archiver');
        expect(
            await screen.findByRole('button', { name: /Archivés \(1\)/ }),
        ).toBeTruthy();
    });

    it('deletes a draft from the disk once confirmed', async () => {
        let deleted = false;
        const requests: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                const url = String(input);
                requests.push(`${init?.method ?? 'GET'} ${url}`);
                if (url === '/api/libraries') {
                    return respond([{ id: 1, name: 'Mangas', type: 'manga' }]);
                }
                if (init?.method === 'DELETE') {
                    deleted = true;
                    return respond({ deleted: 1 });
                }
                if (url === '/api/libraries/1/drafts') {
                    return respond(
                        deleted
                            ? []
                            : [
                                  {
                                      folder: '_draft/Gantz',
                                      files: [
                                          {
                                              path: '_draft/Gantz/T01.cbz',
                                              name: 'T01.cbz',
                                              size: 10,
                                          },
                                      ],
                                      archivedAt: null,
                                  },
                              ],
                    );
                }
                if (url.startsWith('/api/libraries/1/drafts/files?')) {
                    return respond([
                        {
                            path: '_draft/Gantz/T01.cbz',
                            name: 'T01.cbz',
                            folder: '_draft/Gantz',
                            size: 10,
                            draft: true,
                            pageCount: 2,
                            comicInfo: { Series: 'Gantz', Number: '1' },
                            error: null,
                            publicationPath: 'Gantz/Gantz #01.cbz',
                        },
                    ]);
                }
                if (url === '/api/drafts/pending')
                    return respond({ series: 0 });
                throw new Error(`requête inattendue : ${url}`);
            },
        );

        render(
            <MantineProvider>
                <MemoryRouter
                    initialEntries={['/drafts?library=1&folder=_draft%2FGantz']}
                >
                    <DraftsPage />
                </MemoryRouter>
            </MantineProvider>,
        );

        await menuAction('Supprimer du disque');
        fireEvent.click(
            await screen.findByRole('button', { name: 'Supprimer 1 tome' }),
        );

        expect(await screen.findByText('Aucun brouillon.')).toBeTruthy();
        expect(requests).toContain(
            'DELETE /api/libraries/1/drafts?folder=_draft%2FGantz',
        );
    });
    it('offers to merge drafts of one series, received one folder per volume', async () => {
        let merged = false;
        const sent: unknown[] = [];
        const draft = (folder: string, seriesName: string) => ({
            folder,
            files: [{ path: `${folder}/T.cbz`, name: 'T.cbz', size: 10 }],
            archivedAt: null,
            seriesName,
            mergeKey: seriesName.toLowerCase(),
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (input, init) => {
                const url = String(input);
                if (url === '/api/libraries') {
                    return respond([{ id: 1, name: 'Mangas', type: 'manga' }]);
                }
                if (url === '/api/libraries/1/drafts/merge') {
                    sent.push(JSON.parse(String(init!.body)));
                    merged = true;
                    return respond({
                        folder: '_draft/Gantz T01',
                        moved: 2,
                        failures: [],
                    });
                }
                if (url === '/api/libraries/1/drafts') {
                    return respond(
                        merged
                            ? [draft('_draft/Gantz T01', 'Gantz')]
                            : [
                                  draft('_draft/Gantz T01', 'Gantz'),
                                  draft('_draft/Gantz T02', 'Gantz'),
                                  draft('_draft/Gantz T03', 'Gantz'),
                                  draft('_draft/Spirale', 'Spirale'),
                              ],
                    );
                }
                if (url.startsWith('/api/libraries/1/drafts/files?')) {
                    return respond([]);
                }
                if (url === '/api/drafts/pending')
                    return respond({ series: 1 });
                throw new Error(`requête inattendue : ${url}`);
            },
        );

        render(
            <MantineProvider>
                <MemoryRouter initialEntries={['/drafts']}>
                    <DraftsPage />
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(
            await screen.findByText('3 brouillons semblent être « Gantz »'),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Fusionner' }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(
            await within(dialog).findByRole('button', { name: 'Fusionner' }),
        );

        await vi.waitFor(() =>
            expect(screen.queryByText(/semblent être/)).toBeNull(),
        );
        expect(sent).toEqual([
            {
                into: '_draft/Gantz T01',
                from: ['_draft/Gantz T02', '_draft/Gantz T03'],
            },
        ]);
        // Le dossier obtenu est ouvert.
        expect(await screen.findByText('Ce dossier est vide.')).toBeTruthy();
    });
});
