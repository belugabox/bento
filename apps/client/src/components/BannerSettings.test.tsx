import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BannerSettings } from './BannerSettings';

let requests: [string, string, unknown][] = [];

beforeEach(() => {
    requests = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const method = init?.method ?? 'GET';
        requests.push([
            method,
            String(input),
            typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        ]);
        const body =
            method === 'GET'
                ? {
                      banners: [
                          {
                              site: 'manga-news',
                              url: 'https://www.manga-news.com/banner.jpg',
                              title: 'Gantz',
                          },
                          {
                              site: 'anilist',
                              url: 'https://s4.anilist.co/gantz.jpg',
                              title: 'GANTZ',
                          },
                      ],
                      errors: ['AniList limite les requêtes'],
                  }
                : { bannerUpdatedAt: '2026-11-12T10:00:00.000Z' };
        return new Response(JSON.stringify(body), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('BannerSettings', () => {
    it('searches the banners on demand, then keeps the one chosen', async () => {
        const onChanged = vi.fn();
        render(
            <MantineProvider>
                <BannerSettings
                    series={{ id: 3, bannerUpdatedAt: null }}
                    onChanged={onChanged}
                />
            </MantineProvider>,
        );
        // Rien n'est demandé avant le clic.
        expect(requests).toEqual([]);

        fireEvent.click(
            screen.getByRole('button', { name: 'Chercher une bannière' }),
        );
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Choisir la bannière AniList : GANTZ',
            }),
        );
        // Les erreurs d'un site n'empêchent pas les autres.
        expect(screen.getByText('AniList limite les requêtes')).toBeTruthy();
        await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(requests).toEqual([
            ['GET', '/api/series/3/banners', undefined],
            [
                'PUT',
                '/api/series/3/banner',
                { url: 'https://s4.anilist.co/gantz.jpg' },
            ],
        ]);
    });

    it('shows the current banner, which can be removed', async () => {
        const onChanged = vi.fn();
        render(
            <MantineProvider>
                <BannerSettings
                    series={{
                        id: 3,
                        bannerUpdatedAt: '2026-11-12T10:00:00.000Z',
                    }}
                    onChanged={onChanged}
                />
            </MantineProvider>,
        );
        expect(
            screen
                .getByRole('img', { name: 'Bannière actuelle' })
                .getAttribute('src'),
        ).toBe('/api/series/3/banner?v=2026-11-12T10%3A00%3A00.000Z');
        fireEvent.click(screen.getByRole('button', { name: 'Retirer' }));
        await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(requests).toContainEqual([
            'DELETE',
            '/api/series/3/banner',
            undefined,
        ]);
    });
});
