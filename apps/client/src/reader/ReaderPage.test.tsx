import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReaderPage } from './ReaderPage';

const volume = (direction: 'rtl' | 'ltr') => ({
    id: 7,
    seriesId: 3,
    seriesName: 'Spy x Family',
    number: '1',
    title: null,
    pageCount: 3,
    libraryType: direction === 'rtl' ? 'manga' : 'comics',
    direction,
    previousId: null,
    nextId: 8,
});

let location = '';
const Location = () => {
    location = useLocation().pathname + useLocation().search;
    return null;
};

const open = async (direction: 'rtl' | 'ltr', url = '/read/7') => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(volume(direction)), {
            headers: { 'Content-Type': 'application/json' },
        }),
    );
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={[url]}>
                <Routes>
                    <Route path="/read/:id" element={<ReaderPage />} />
                    <Route path="*" element={null} />
                </Routes>
                <Location />
            </MemoryRouter>
        </MantineProvider>,
    );
    await screen.findByAltText(/^Page /);
};

const shownPage = () => screen.getByAltText(/^Page /).getAttribute('src');
const press = (key: string) =>
    act(() => {
        fireEvent.keyDown(window, { key });
    });

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ReaderPage', () => {
    it('turns pages with the left arrow when reading a manga', async () => {
        await open('rtl');
        expect(shownPage()).toBe('/api/volumes/7/pages/0');

        press('ArrowLeft');
        expect(shownPage()).toBe('/api/volumes/7/pages/1');
        expect(location).toBe('/read/7?page=2');

        press('ArrowRight');
        expect(shownPage()).toBe('/api/volumes/7/pages/0');
    });

    it('turns pages with the right arrow when reading a comic', async () => {
        await open('ltr');

        press('ArrowRight');

        expect(shownPage()).toBe('/api/volumes/7/pages/1');
    });

    it('resumes at the page in the address', async () => {
        await open('rtl', '/read/7?page=3');

        expect(shownPage()).toBe('/api/volumes/7/pages/2');
    });

    it('offers the next volume after the last page', async () => {
        await open('rtl', '/read/7?page=3');

        press(' ');

        expect(screen.getByText('Fin du tome')).toBeTruthy();
        expect(
            screen
                .getByRole('link', { name: 'Tome suivant' })
                .getAttribute('href'),
        ).toBe('/read/8');
    });

    it('goes back to the series with Escape', async () => {
        await open('rtl');

        press('Escape');

        expect(location).toBe('/series/3');
    });
});
