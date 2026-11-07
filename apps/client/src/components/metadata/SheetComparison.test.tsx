import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SOURCE_PRIORITY, type GenreEntry } from '@server/types';

import { SheetComparison } from './SheetComparison';
import type { FoundSeries } from './onlineSheets';

const FOUND: FoundSeries[] = [
    {
        source: 'manga-news',
        id: 'Gantz',
        title: 'Gantz',
        url: 'https://www.manga-news.com/index.php/serie/Gantz',
        sheet: { title: 'Gantz', genre: 'Suspense', writer: 'Hiroya Oku' },
    },
];

const show = (catalog: GenreEntry[], onApply = vi.fn()) => (
    <MantineProvider>
        <SheetComparison
            found={FOUND}
            onClose={() => {}}
            current={{ Series: 'Gantz', Writer: 'H. Oku' }}
            catalog={catalog}
            formats={[]}
            known={{ people: [], publishers: [] }}
            order={['manga-news', 'wikipedia']}
            priority={DEFAULT_SOURCE_PRIORITY}
            display={(_, value) => value}
            onApply={onApply}
        />
    </MantineProvider>
);

describe('SheetComparison', () => {
    it('follows the genre list loaded after the sheets, keeping the choices', async () => {
        const onApply = vi.fn();
        const { rerender } = render(show([], onApply));
        // Sans la liste, « Suspense » n'est qu'un thème.
        expect(await screen.findByText('Suspense')).toBeTruthy();
        // Champ rempli : l'actuel d'office ; on prend celui de la fiche.
        fireEvent.click(
            screen.getByRole('radio', { name: 'Scénario : Manga-news' }),
        );

        rerender(show([{ name: 'Thriller', aliases: ['Suspense'] }], onApply));

        expect(await screen.findByText('Thriller')).toBeTruthy();
        expect(
            (
                screen.getByRole('radio', {
                    name: 'Scénario : Manga-news',
                }) as HTMLInputElement
            ).checked,
        ).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
        expect(onApply).toHaveBeenCalledWith({
            Genre: 'Thriller',
            Writer: 'Hiroya Oku',
        });
    });
});
