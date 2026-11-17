import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useScrollToTop } from './scrollToTop';

const Page = () => {
    useScrollToTop();
    const navigate = useNavigate();
    return (
        <>
            <Link to="/library">Bibliothèque</Link>
            <button
                onClick={() =>
                    void navigate('/?genre=Action', { replace: true })
                }
            >
                Filtrer
            </button>
            <button onClick={() => void navigate(-1)}>Retour</button>
        </>
    );
};

afterEach(() => vi.restoreAllMocks());

describe('useScrollToTop', () => {
    it('starts an opened page at its top, not when filtering or going back', () => {
        const scrollTo = vi
            .spyOn(window, 'scrollTo')
            .mockImplementation(() => undefined);
        render(
            <MemoryRouter initialEntries={['/']}>
                <Page />
            </MemoryRouter>,
        );
        // Première page : rien.
        expect(scrollTo).not.toHaveBeenCalled();

        // Même page, adresse changée (filtre) : rien.
        fireEvent.click(screen.getByRole('button', { name: 'Filtrer' }));
        expect(scrollTo).not.toHaveBeenCalled();

        // Page ouverte : en haut.
        fireEvent.click(screen.getByRole('link', { name: 'Bibliothèque' }));
        expect(scrollTo).toHaveBeenCalledWith(0, 0);
        scrollTo.mockClear();

        // Retour arrière : la position revient d'ailleurs, rien ici.
        fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
        expect(scrollTo).not.toHaveBeenCalled();
    });
});
