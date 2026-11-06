import { MantineProvider } from '@mantine/core';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type EditorVolume, MetadataEditor } from './MetadataEditor';

const volumes = (): EditorVolume[] => [
    {
        path: '_draft/Gantz/Gantz T01 (2017).cbz',
        name: 'Gantz T01 (2017).cbz',
        comicInfo: { Series: 'Gantz' },
        cover: null,
    },
    {
        path: '_draft/Gantz/Gantz T02 (2017).cbz',
        name: 'Gantz T02 (2017).cbz',
        comicInfo: {},
        cover: null,
    },
];

// Requêtes envoyées au serveur : [méthode, adresse, corps].
let requests: [string, string, unknown][] = [];

const mockServer = () => {
    requests = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        requests.push([init?.method ?? 'GET', String(input), body]);
        const response = String(input).endsWith('/publish')
            ? {
                  published: body.paths.map((p: string) => ({
                      from: p,
                      to: p,
                  })),
                  failures: [],
              }
            : { updated: body.updates, failures: [] };
        return new Response(JSON.stringify(response), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
};

const Editor = ({ onChanged = () => {} }: { onChanged?: () => void }) => (
    <MantineProvider>
        <MetadataEditor
            libraryId={1}
            kind="manga"
            mode="drafts"
            // Nouvelle liste à chaque rendu, comme dans la page des brouillons.
            volumes={volumes()}
            onChanged={onChanged}
        />
    </MantineProvider>
);

const numberOf = (n: number) =>
    screen.getByLabelText(
        `Numéro de Gantz T0${n} (2017).cbz`,
    ) as HTMLInputElement;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MetadataEditor', () => {
    it('keeps what is typed when the page re-renders', () => {
        const { rerender } = render(<Editor />);

        fireEvent.change(numberOf(1), { target: { value: '1' } });
        rerender(<Editor />);

        expect(numberOf(1).value).toBe('1');
        expect(
            screen.getByRole('button', { name: /Enregistrer \(1\)/ }),
        ).toBeTruthy();
    });

    it('fills numbers and years from the file names, then saves only the changes', async () => {
        mockServer();
        const onChanged = vi.fn();
        render(<Editor onChanged={onChanged} />);

        fireEvent.click(screen.getByRole('button', { name: /Remplir/ }));
        fireEvent.click(
            await screen.findByRole('button', {
                name: /noms de fichiers seulement/,
            }),
        );
        expect(numberOf(1).value).toBe('1');
        expect(numberOf(2).value).toBe('2');
        // Champs remplis : surlignés jusqu'à l'enregistrement.
        expect(numberOf(1).getAttribute('data-changed')).toBe('true');
        // Titre rempli (« Tome 1 ») ; le genre, lui, n'a pas changé.
        expect(
            (
                screen.getByLabelText(
                    'Titre de Gantz T01 (2017).cbz',
                ) as HTMLInputElement
            ).value,
        ).toBe('Tome 1');
        expect(
            screen.getByLabelText('Genre').getAttribute('data-changed'),
        ).toBeNull();

        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: /Enregistrer \(2\)/ }),
            );
        });

        expect(requests).toEqual([
            [
                'PUT',
                '/api/libraries/1/files/comic-info',
                {
                    updates: [
                        {
                            path: '_draft/Gantz/Gantz T01 (2017).cbz',
                            changes: {
                                Number: '1',
                                Title: 'Tome 1',
                                Year: 2017,
                            },
                        },
                        {
                            path: '_draft/Gantz/Gantz T02 (2017).cbz',
                            changes: {
                                Series: 'Gantz',
                                Number: '2',
                                Title: 'Tome 2',
                                Year: 2017,
                            },
                        },
                    ],
                },
            ],
        ]);
        expect(onChanged).toHaveBeenCalled();
    });

    it('publishes once everything is saved and complete', async () => {
        mockServer();
        render(
            <MantineProvider>
                <MetadataEditor
                    libraryId={1}
                    kind="manga"
                    mode="drafts"
                    volumes={volumes().map((v, i) => ({
                        ...v,
                        comicInfo: { Series: 'Gantz', Number: String(i + 1) },
                    }))}
                    onChanged={() => {}}
                />
            </MantineProvider>,
        );
        expect(screen.getByText('→ Gantz/Gantz #01.cbz')).toBeTruthy();
        const publish = screen.getByRole('button', { name: /Publier \(2\)/ });

        await act(async () => {
            fireEvent.click(publish);
        });

        await waitFor(() =>
            expect(requests).toEqual([
                [
                    'POST',
                    '/api/libraries/1/files/publish',
                    {
                        paths: [
                            '_draft/Gantz/Gantz T01 (2017).cbz',
                            '_draft/Gantz/Gantz T02 (2017).cbz',
                        ],
                    },
                ],
            ]),
        );
        expect(screen.getByText('2 tome(s) publié(s).')).toBeTruthy();
    });

    it('waits for the changes to be saved before publishing', () => {
        render(<Editor />);

        fireEvent.change(numberOf(1), { target: { value: '1' } });

        const publish = screen.getByRole('button', { name: /Publier/ });
        expect(publish.getAttribute('title')).toBe(
            'Enregistre d’abord les modifications',
        );
        expect((publish as HTMLButtonElement).disabled).toBe(true);
    });

    it('saves the series status alone, with its own message', async () => {
        const save = vi.fn().mockResolvedValue({});
        render(
            <MantineProvider>
                <MetadataEditor
                    libraryId={1}
                    kind="manga"
                    mode="drafts"
                    volumes={volumes()}
                    status={{ value: null, save }}
                    onChanged={() => {}}
                />
            </MantineProvider>,
        );

        fireEvent.click(screen.getByRole('textbox', { name: 'Statut' }));
        fireEvent.click(await screen.findByText('Terminée'));
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: /Enregistrer/ }),
            );
        });

        expect(save).toHaveBeenCalledWith('completed');
        expect(screen.getByText('Statut de la série enregistré.')).toBeTruthy();
        expect(screen.queryByText(/tome\(s\) enregistré/)).toBeNull();
    });

    it('fills from Wikipedia, then from the file names', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            const body = url.includes('/metadata/wikipedia/search')
                ? [
                      {
                          id: 7,
                          title: 'Gantz',
                          url: 'https://fr.wikipedia.org/wiki/Gantz',
                      },
                  ]
                : {
                      id: 7,
                      title: 'Gantz',
                      url: 'https://fr.wikipedia.org/wiki/Gantz',
                      summary: 'Des aliens.',
                      genre: 'Science-fiction',
                      writer: 'Hiroya Oku',
                      penciller: 'Hiroya Oku',
                      publisher: 'Tonkam',
                      volumeCount: 37,
                      firstYear: 2000,
                      lastYear: 2013,
                      ongoing: false,
                  };
            return new Response(JSON.stringify(body), {
                headers: { 'Content-Type': 'application/json' },
            });
        });
        render(<Editor />);

        fireEvent.click(screen.getByRole('button', { name: /Remplir/ }));
        const searchButton = await screen.findByRole('button', {
            name: 'Rechercher',
        });
        // La recherche part du nom de la série en cours d'édition.
        expect(
            (screen.getByPlaceholderText('Nom de la série') as HTMLInputElement)
                .value,
        ).toBe('Gantz');
        fireEvent.click(searchButton);
        fireEvent.click(await screen.findByRole('button', { name: 'Gantz' }));
        fireEvent.click(
            await screen.findByRole('button', { name: 'Utiliser cette fiche' }),
        );

        expect((screen.getByLabelText('Genre') as HTMLInputElement).value).toBe(
            'Science-fiction',
        );
        // Puis les noms de fichiers : numéros, titres, années.
        expect(numberOf(2).value).toBe('2');
        expect(
            (
                screen.getByLabelText(
                    'Titre de Gantz T02 (2017).cbz',
                ) as HTMLInputElement
            ).value,
        ).toBe('Tome 2');
    });

    it('saves the reading mode of a published series', async () => {
        const save = vi.fn().mockResolvedValue({});
        render(
            <MantineProvider>
                <MetadataEditor
                    libraryId={1}
                    kind="manga"
                    mode="series"
                    volumes={volumes()}
                    readingMode={{
                        value: null,
                        defaultMode: 'ltr-manga',
                        save,
                    }}
                    onChanged={() => {}}
                />
            </MantineProvider>,
        );
        expect(
            screen.getByDisplayValue('Par défaut : Manga (gauche → droite)'),
        ).toBeTruthy();

        fireEvent.click(
            screen.getByRole('textbox', { name: 'Mode de lecture' }),
        );
        fireEvent.click(
            await screen.findByText('Webtoon (défilement vertical)'),
        );
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: /Enregistrer/ }),
            );
        });

        expect(save).toHaveBeenCalledWith('webtoon');
        expect(screen.getByText('Mode de lecture enregistré.')).toBeTruthy();
    });

    it('previews a volume in the chosen reading mode, then keeps the mode', async () => {
        const save = vi.fn().mockResolvedValue({});
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify([[20, 30]]), {
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        render(
            <MantineProvider>
                <MetadataEditor
                    libraryId={1}
                    kind="manga"
                    mode="drafts"
                    volumes={volumes().map((v) => ({ ...v, pageCount: 1 }))}
                    readingMode={{
                        value: 'webtoon',
                        defaultMode: 'ltr-manga',
                        save,
                    }}
                    onChanged={() => {}}
                />
            </MantineProvider>,
        );

        fireEvent.click(
            screen.getByRole('button', {
                name: 'Aperçu de Gantz T02 (2017).cbz',
            }),
        );

        const page = await screen.findByAltText('Page 1');
        expect(page.getAttribute('src')).toBe(
            `/api/libraries/1/files/pages/0?path=${encodeURIComponent('_draft/Gantz/Gantz T02 (2017).cbz')}`,
        );
        // Webtoon : la place des pages est demandée au serveur.
        expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toMatch(
            /files\/page-sizes\?path=/,
        );

        fireEvent.click(
            screen.getAllByRole('button', { name: 'Fermer l’aperçu' })[0]!,
        );
        expect(screen.queryByAltText('Page 1')).toBeNull();
        expect(save).not.toHaveBeenCalled();
    });

    it('adds the drafts to a published series, with its series fields', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            const body = url.startsWith('/api/series?')
                ? [{ id: 5, name: 'Gantz Perfect' }]
                : {
                      name: 'Gantz Perfect',
                      volumes: [
                          {
                              number: '1',
                              title: null,
                              admin: {
                                  comicInfo: {
                                      Series: 'Gantz Perfect',
                                      Writer: 'Hiroya Oku',
                                  },
                              },
                          },
                      ],
                  };
            return new Response(JSON.stringify(body), {
                headers: { 'Content-Type': 'application/json' },
            });
        });
        render(<Editor />);
        const name = () =>
            (screen.getByLabelText('Nom') as HTMLInputElement).value;
        const initialName = name();

        fireEvent.click(
            screen.getByRole('textbox', {
                name: 'Ajouter à une série existante',
            }),
        );
        fireEvent.click(await screen.findByText('Gantz Perfect'));

        await waitFor(() =>
            expect(
                (screen.getByLabelText('Nom') as HTMLInputElement).value,
            ).toBe('Gantz Perfect'),
        );
        expect(
            (screen.getByLabelText('Scénario') as HTMLInputElement).value,
        ).toBe('Hiroya Oku');
        expect(
            await screen.findByText('1 tome(s) publié(s), le dernier : Tome 1'),
        ).toBeTruthy();

        // Effacer le choix rend les champs d'avant.
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Ne pas ajouter à cette série',
            }),
        );
        expect(name()).toBe(initialName);
        expect(
            (screen.getByLabelText('Scénario') as HTMLInputElement).value,
        ).toBe('');
    });
});
