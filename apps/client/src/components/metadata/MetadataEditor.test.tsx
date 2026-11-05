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
        fireEvent.click(await screen.findByText('Depuis les noms de fichiers'));
        expect(numberOf(1).value).toBe('1');
        expect(numberOf(2).value).toBe('2');

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
                            changes: { Number: '1', Year: 2017 },
                        },
                        {
                            path: '_draft/Gantz/Gantz T02 (2017).cbz',
                            changes: {
                                Series: 'Gantz',
                                Number: '2',
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
});
