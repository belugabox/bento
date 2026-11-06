import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GenresSettings } from './GenresSettings';

type Genre = {
    id: number;
    name: string;
    aliases: string[];
    seriesCount: number;
};

let genres: Genre[] = [];
// Requêtes de modification : [méthode, adresse, corps].
let changes: [string, string, unknown][] = [];

const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });

beforeEach(() => {
    genres = [
        { id: 1, name: 'Comédie', aliases: ['Humour'], seriesCount: 2 },
        { id: 2, name: 'Thriller', aliases: [], seriesCount: 1 },
    ];
    changes = [];
    // Serveur simulé : la liste suit les modifications.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        if (method !== 'GET') changes.push([method, url, body]);
        const id = Number(/genres\/(\d+)/.exec(url)?.[1]);
        if (method === 'POST') {
            genres.push({ id: 3, aliases: [], seriesCount: 0, ...body });
        } else if (method === 'PATCH') {
            genres = genres.map((g) => (g.id === id ? { ...g, ...body } : g));
        } else if (method === 'DELETE') {
            genres = genres.filter((g) => g.id !== id);
        }
        return json(method === 'GET' ? genres : {});
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

const show = () =>
    render(
        <MantineProvider>
            <GenresSettings />
        </MantineProvider>,
    );

describe('GenresSettings', () => {
    it('lists the genres with their other names, and adds one', async () => {
        show();
        expect(await screen.findByText('Comédie')).toBeTruthy();
        expect(screen.getByText('Humour')).toBeTruthy();
        expect(screen.getByText('2 séries')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Nouveau genre'), {
            target: { value: 'Sport' },
        });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
        });

        expect(changes).toEqual([
            ['POST', '/api/genres', { name: 'Sport', aliases: [] }],
        ]);
        expect(await screen.findByText('Sport')).toBeTruthy();
    });

    it('renames a genre', async () => {
        show();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Modifier Thriller' }),
        );
        const name = await screen.findByRole('textbox', { name: 'Nom' });
        fireEvent.change(name, { target: { value: 'Suspense' } });
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Enregistrer' }),
            );
        });

        expect(changes).toEqual([
            ['PATCH', '/api/genres/2', { name: 'Suspense', aliases: [] }],
        ]);
        expect(await screen.findByText('Suspense')).toBeTruthy();
    });

    it('merges a genre into another', async () => {
        show();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Supprimer Thriller' }),
        );
        fireEvent.click(
            await screen.findByRole('textbox', { name: 'Fusionner dans' }),
        );
        fireEvent.click(await screen.findByRole('option', { name: 'Comédie' }));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Fusionner' }));
        });

        expect(changes).toEqual([
            ['DELETE', '/api/genres/2?into=1', undefined],
        ]);
    });
});
