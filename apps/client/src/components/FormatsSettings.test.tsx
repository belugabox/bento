import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FormatsSettings } from './FormatsSettings';

type Format = {
    id: number;
    name: string;
    readingMode: string;
    seriesCount: number;
};

let formats: Format[] = [];
// Requêtes de modification : [méthode, adresse, corps].
let changes: [string, string, unknown][] = [];

beforeEach(() => {
    formats = [
        { id: 1, name: 'Manga', readingMode: 'ltr-manga', seriesCount: 3 },
        { id: 2, name: 'BD', readingMode: 'ltr', seriesCount: 0 },
    ];
    changes = [];
    // Serveur simulé : la liste suit les modifications.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        if (method !== 'GET') changes.push([method, url, body]);
        const id = Number(/formats\/(\d+)/.exec(url)?.[1]);
        if (method === 'POST') formats.push({ id: 3, seriesCount: 0, ...body });
        if (method === 'PATCH') {
            formats = formats.map((f) => (f.id === id ? { ...f, ...body } : f));
        }
        if (method === 'DELETE') formats = formats.filter((f) => f.id !== id);
        return new Response(JSON.stringify(method === 'GET' ? formats : {}), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

const show = () =>
    render(
        <MantineProvider>
            <FormatsSettings />
        </MantineProvider>,
    );

describe('FormatsSettings', () => {
    it('lists the formats, and adds one with its reading mode', async () => {
        show();
        expect(await screen.findByText('Manga')).toBeTruthy();
        expect(screen.getByText('3 séries')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Nouveau format'), {
            target: { value: 'Webtoon' },
        });
        fireEvent.click(
            screen.getByRole('textbox', {
                name: 'Mode de lecture du nouveau format',
            }),
        );
        fireEvent.click(await screen.findByRole('option', { name: /Webtoon/ }));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
        });

        expect(changes).toEqual([
            [
                'POST',
                '/api/formats',
                { name: 'Webtoon', readingMode: 'webtoon' },
            ],
        ]);
        expect(await screen.findByText('Webtoon')).toBeTruthy();
    });

    it('warns before deleting a format used by series', async () => {
        show();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Supprimer Manga' }),
        );
        expect(
            await screen.findByText(/3 séries n’auront plus de format/),
        ).toBeTruthy();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        });

        expect(changes).toEqual([['DELETE', '/api/formats/1', undefined]]);
    });
});
