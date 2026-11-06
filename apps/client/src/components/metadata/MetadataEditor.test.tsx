import { MantineProvider } from '@mantine/core';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    DEFAULT_AGE_STEPS,
    DEFAULT_FORMATS,
    DEFAULT_GENRES,
    DEFAULT_SOURCE_PRIORITY,
} from '@server/types';

import { type EditorVolume, MetadataEditor } from './MetadataEditor';

// Genres, formats et grille d'âges : ceux de départ, sans passer par le
// serveur. Formats numérotés à partir de 1 (Manga : 1, Manhwa : 2…).
vi.mock('@/services/api', async (original) => ({
    ...(await original<typeof import('@/services/api')>()),
    fetchGenres: async () =>
        DEFAULT_GENRES.map((genre, id) => ({ id, ...genre, seriesCount: 0 })),
    fetchFormats: async () =>
        DEFAULT_FORMATS.map((format, index) => ({
            id: index + 1,
            ...format,
            seriesCount: 0,
        })),
    fetchSettings: async () => ({
        settings: {
            ages: DEFAULT_AGE_STEPS,
            sourcePriority: DEFAULT_SOURCE_PRIORITY,
        },
    }),
    fetchCredits: async () => ({
        writers: ['Hiroya Oku'],
        pencillers: [],
        publishers: ['Tonkam'],
    }),
}));

/** Pastilles d'un champ à valeurs multiples (genres, thèmes). */
const pillsOf = (label: string) =>
    [
        ...(screen
            .getByRole('textbox', { name: label })
            .closest('.mantine-InputWrapper-root')
            ?.querySelectorAll('.mantine-Pill-label') ?? []),
    ].map((pill) => pill.textContent);

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

/**
 * Serveur simulé ; `online` : réponses des recherches en ligne, par début
 * d'adresse après `/metadata/` (« wikipedia/search »).
 */
const mockServer = (online: Record<string, unknown> = {}) => {
    requests = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        requests.push([init?.method ?? 'GET', url, body]);
        const site = Object.keys(online).find((key) =>
            url.includes(`/metadata/${key}`),
        );
        const response = site
            ? online[site]
            : url.endsWith('/publish')
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

const WIKI_GANTZ = {
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

const MANGA_NEWS_GANTZ = {
    id: 'Gantz',
    title: 'Gantz',
    url: 'https://www.manga-news.com/index.php/serie/Gantz',
    originalTitle: 'Gantz',
    summary: 'Des aliens.',
    genres: ['Suspense', 'Science-fiction'],
    themes: ['aliens'],
    writer: 'Hiroya OKU',
    penciller: 'Hiroya OKU',
    publisher: 'Tonkam',
    format: 'manga',
    age: 16,
    ageRating: 'Mature 17+',
    volumeCount: 37,
    ongoing: false,
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
            screen
                .getByRole('textbox', { name: 'Genres' })
                .getAttribute('data-changed'),
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

    it('sorts the genres of old files, and saves the format', async () => {
        mockServer();
        const save = vi.fn().mockResolvedValue({});
        render(
            <MantineProvider>
                <MetadataEditor
                    libraryId={1}
                    kind="manga"
                    mode="drafts"
                    volumes={volumes().map((volume) => ({
                        ...volume,
                        comicInfo: {
                            ...volume.comicInfo,
                            Genre: 'Shonen, Humour, Mature, Espions',
                        },
                    }))}
                    classification={{
                        formatId: null,
                        age: null,
                        save,
                    }}
                    onChanged={() => {}}
                />
            </MantineProvider>,
        );

        await waitFor(() => expect(pillsOf('Genres')).toEqual(['Comédie']));
        expect(pillsOf('Thèmes')).toEqual(['Shonen', 'Espions']);

        const themes = screen.getByRole('textbox', { name: 'Thèmes' });
        fireEvent.change(themes, { target: { value: 'famille' } });
        fireEvent.keyDown(themes, { key: 'Enter' });
        fireEvent.click(screen.getByRole('textbox', { name: 'Format' }));
        fireEvent.click(await screen.findByText('Manhwa'));
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: /Enregistrer/ }),
            );
        });

        // L'âge quitte les genres du fichier, les mots inconnus vont aux thèmes.
        expect(requests[0]?.[2]).toEqual({
            updates: volumes().map((volume) => ({
                path: volume.path,
                changes: {
                    Genre: 'Comédie',
                    Tags: 'Shonen, Espions, famille',
                },
            })),
        });
        expect(save).toHaveBeenCalledWith({ formatId: 2 });
        expect(screen.getByText('Format enregistré.')).toBeTruthy();
    });

    it('shows the original value of a changed field, and goes back to it', async () => {
        mockServer();
        render(<Editor />);
        const name = screen.getByRole('textbox', {
            name: 'Nom',
        }) as HTMLInputElement;

        fireEvent.change(name, { target: { value: 'Gantz:G' } });
        expect(name.getAttribute('data-changed')).toBe('true');
        // Au toucher (tablette) : la valeur s'affiche, puis on y revient.
        fireEvent.click(
            screen.getByRole('button', { name: 'Voir la valeur d’origine' }),
        );
        expect(await screen.findByText('Gantz')).toBeTruthy();
        fireEvent.click(
            screen.getByRole('button', { name: 'Revenir à cette valeur' }),
        );

        expect(name.value).toBe('Gantz');
        expect(name.getAttribute('data-changed')).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Voir la valeur d’origine' }),
        ).toBeNull();

        // Un champ vide à l'origine.
        fireEvent.change(numberOf(1), { target: { value: '7' } });
        fireEvent.click(
            screen.getByRole('button', { name: 'Voir la valeur d’origine' }),
        );
        expect(await screen.findByText('(vide)')).toBeTruthy();
        fireEvent.click(
            screen.getByRole('button', { name: 'Revenir à cette valeur' }),
        );
        expect(numberOf(1).value).toBe('');
    });

    it('requires a format, and keeps the exact age in Bento', async () => {
        mockServer();
        const save = vi.fn().mockResolvedValue({});
        render(
            <MantineProvider>
                <MetadataEditor
                    libraryId={1}
                    kind="manga"
                    mode="drafts"
                    volumes={volumes()}
                    classification={{ formatId: null, age: null, save }}
                    onChanged={() => {}}
                />
            </MantineProvider>,
        );
        expect(await screen.findByText('Format à choisir')).toBeTruthy();

        fireEvent.click(screen.getByRole('textbox', { name: 'Âge' }));
        fireEvent.click(await screen.findByRole('option', { name: '12+' }));
        const saveButton = screen.getByRole('button', { name: /Enregistrer/ });
        // Sans format, rien ne s'enregistre.
        expect(saveButton.hasAttribute('disabled')).toBe(true);

        fireEvent.click(screen.getByRole('textbox', { name: /Format/ }));
        fireEvent.click(await screen.findByRole('option', { name: 'Manga' }));
        await act(async () => {
            fireEvent.click(saveButton);
        });

        expect(save).toHaveBeenCalledWith({ formatId: 1, age: 12 });
        // Le ComicInfo reçoit la classification la plus proche, plus stricte.
        expect(
            (requests[0]?.[2] as { updates: { changes: object }[] }).updates[0]
                ?.changes,
        ).toEqual({ AgeRating: 'Teen' });
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

    it('searches both sites, then fills from the sheet chosen and the file names', async () => {
        mockServer({
            'manga-news/search': [],
            'wikipedia/search': [
                {
                    id: 7,
                    title: 'Gantz',
                    url: 'https://fr.wikipedia.org/wiki/Gantz',
                },
            ],
            'wikipedia/7': WIKI_GANTZ,
        });
        render(<Editor />);

        fireEvent.click(screen.getByRole('button', { name: /Remplir/ }));
        // La recherche part du nom de la série en cours d'édition.
        expect(
            (
                (await screen.findByPlaceholderText(
                    'Nom de la série',
                )) as HTMLInputElement
            ).value,
        ).toBe('Gantz');
        fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
        // Les deux sites à la fois ; un seul résultat au nom exact : ouvert.
        const wikipedia = await screen.findByRole('region', {
            name: 'Wikipédia',
        });
        expect(await within(wikipedia).findByText('Hiroya Oku')).toBeTruthy();
        expect(
            await within(
                screen.getByRole('region', { name: 'Manga-news' }),
            ).findByText(/Aucune série trouvée/),
        ).toBeTruthy();
        fireEvent.click(
            screen.getByRole('button', { name: 'Comparer la fiche' }),
        );

        // Champs vides : la valeur de la fiche, proposée d'office.
        expect(
            (
                (await screen.findByRole('radio', {
                    name: 'Genres : Wikipédia',
                })) as HTMLInputElement
            ).checked,
        ).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

        expect(pillsOf('Genres')).toEqual(['Science-fiction']);
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

    it('fills from Manga-news: sorted genres, themes, age, format, and keeps the sheet', async () => {
        mockServer({
            'manga-news/search': [{ id: 'Gantz', title: 'Gantz', year: 2000 }],
            'manga-news/series': MANGA_NEWS_GANTZ,
            'wikipedia/search': [],
        });
        const save = vi.fn().mockResolvedValue({});
        const saveStatus = vi.fn().mockResolvedValue({});
        render(
            <MantineProvider>
                <MetadataEditor
                    libraryId={1}
                    kind="manga"
                    mode="drafts"
                    volumes={volumes()}
                    status={{ value: null, save: saveStatus }}
                    classification={{
                        formatId: null,
                        age: null,
                        save,
                    }}
                    onChanged={() => {}}
                />
            </MantineProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: /Remplir/ }));
        fireEvent.click(
            await screen.findByRole('button', { name: 'Rechercher' }),
        );
        expect(await screen.findByText('Âge conseillé : 16+')).toBeTruthy();
        fireEvent.click(
            screen.getByRole('button', { name: 'Comparer la fiche' }),
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Appliquer' }),
        );

        // « Suspense » rangé dans « Thriller ».
        expect(pillsOf('Genres')).toEqual(['Thriller', 'Science-fiction']);
        expect(pillsOf('Thèmes')).toEqual(['aliens']);
        // Lien vers la fiche, gardé avec la série.
        expect(screen.getByRole('link', { name: 'Manga-news' })).toBeTruthy();
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: /^Enregistrer/ }),
            );
        });

        const changes = (
            [...requests]
                .reverse()
                .find(([method]) => method === 'PUT')?.[2] as {
                updates: { changes: Record<string, unknown> }[];
            }
        ).updates[0]?.changes;
        expect(changes).toMatchObject({
            Genre: 'Thriller, Science-fiction',
            Tags: 'aliens',
            AgeRating: 'Mature 17+',
            // « Hiroya OKU » sur Manga-news : le nom déjà connu.
            Writer: 'Hiroya Oku',
        });
        expect(saveStatus).toHaveBeenCalledWith('completed');
        // Format retrouvé parmi ceux des réglages, âge exact gardé dans Bento.
        expect(save).toHaveBeenCalledWith({
            formatId: 1,
            age: 16,
            sources: [{ site: 'manga-news', id: 'Gantz' }],
        });
        expect(screen.getByText('Format et âge enregistrés.')).toBeTruthy();
        expect(screen.getByText('Fiches en ligne enregistrées.')).toBeTruthy();
    });

    it('compares two sheets field by field, and rereads the saved ones', async () => {
        mockServer({
            'manga-news/series': MANGA_NEWS_GANTZ,
            'wikipedia/7': WIKI_GANTZ,
        });
        render(
            <MantineProvider>
                <MetadataEditor
                    libraryId={1}
                    kind="manga"
                    mode="series"
                    volumes={volumes()}
                    classification={{
                        formatId: 1,
                        age: 16,
                        sources: [
                            { site: 'manga-news', id: 'Gantz' },
                            { site: 'wikipedia', id: '7' },
                        ],
                        save: vi.fn().mockResolvedValue({}),
                    }}
                    onChanged={() => {}}
                />
            </MantineProvider>,
        );

        // Fiches déjà choisies : relues sans recherche.
        fireEvent.click(screen.getByRole('button', { name: /Mettre à jour/ }));
        const writerFrom = async (site: string) =>
            (await screen.findByRole('radio', {
                name: `Scénario : ${site}`,
            })) as HTMLInputElement;
        // Champ vide, deux valeurs : celle du site préféré (Manga-news).
        expect((await writerFrom('Manga-news')).checked).toBe(true);
        fireEvent.click(await writerFrom('Wikipédia'));
        // Format et âge déjà ceux des fiches : pas de ligne.
        expect(screen.queryByRole('radio', { name: /^Format/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

        expect(
            (
                screen.getByRole('textbox', {
                    name: 'Scénario',
                }) as HTMLInputElement
            ).value,
        ).toBe('Hiroya Oku');
        expect(requests.filter(([, url]) => url.includes('/search'))).toEqual(
            [],
        );
    });

    it('saves, then goes to the next series to classify', async () => {
        mockServer();
        const go = vi.fn();
        render(
            <MantineProvider>
                <MetadataEditor
                    libraryId={1}
                    kind="manga"
                    mode="series"
                    volumes={volumes()}
                    next={{ name: 'Mashle', go }}
                    onChanged={() => {}}
                />
            </MantineProvider>,
        );
        const next = screen.getByRole('button', { name: 'Suivante' });
        expect(next.getAttribute('title')).toBe('Série suivante : Mashle');

        fireEvent.change(numberOf(1), { target: { value: '1' } });
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Enregistrer et suivante' }),
            );
        });

        expect(requests.some(([method]) => method === 'PUT')).toBe(true);
        expect(go).toHaveBeenCalledTimes(1);
    });

    it('makes a volume a hors-série, published as HS01', async () => {
        render(<Editor />);
        fireEvent.change(numberOf(1), { target: { value: '1' } });
        fireEvent.click(
            screen.getByRole('textbox', {
                name: 'Type de Gantz T01 (2017).cbz',
            }),
        );
        fireEvent.click(
            await screen.findByRole('option', { name: 'Hors-série' }),
        );

        expect(screen.getByText('→ Gantz/Gantz HS01.cbz')).toBeTruthy();
        expect(
            screen
                .getByRole('textbox', { name: 'Type de Gantz T01 (2017).cbz' })
                .getAttribute('data-changed'),
        ).toBe('true');
    });

    it('suggests the names already known', async () => {
        render(<Editor />);
        fireEvent.change(screen.getByRole('textbox', { name: 'Éditeur' }), {
            target: { value: 'ton' },
        });
        expect(
            await screen.findByRole('option', { name: 'Tonkam' }),
        ).toBeTruthy();
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
            (
                screen.getByRole('textbox', {
                    name: 'Scénario',
                }) as HTMLInputElement
            ).value,
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
            (
                screen.getByRole('textbox', {
                    name: 'Scénario',
                }) as HTMLInputElement
            ).value,
        ).toBe('');

        // « Annuler » efface aussi le choix de la série.
        const picker = () =>
            screen.getByRole('textbox', {
                name: 'Ajouter à une série existante',
            }) as HTMLInputElement;
        fireEvent.click(picker());
        fireEvent.click(await screen.findByText('Gantz Perfect'));
        await waitFor(() => expect(name()).toBe('Gantz Perfect'));
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(name()).toBe(initialName);
        expect(picker().value).toBe('');
    });
});
