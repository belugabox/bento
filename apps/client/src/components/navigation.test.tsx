import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { browseBackLink, navSection, useBrowsePage } from './navigation';

const Browse = () => {
    useBrowsePage();
    return null;
};

const visit = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Browse />
        </MemoryRouter>,
    ).unmount();

describe('navigation', () => {
    it('sends the series page back where it was opened from', () => {
        visit('/library?genre=Action&sort=recent');
        // Une autre page ne change rien.
        visit('/me');
        expect(browseBackLink()).toEqual({
            to: '/library?genre=Action&sort=recent',
            label: 'Retour à la bibliothèque',
        });

        visit('/');
        expect(browseBackLink()).toEqual({
            to: '/',
            label: 'Retour à l’accueil',
        });
    });

    it('lights the tab of each page', () => {
        expect(navSection('/')).toBe('/');
        expect(navSection('/series/4')).toBe('/library');
        expect(navSection('/series/4/edit')).toBeNull();
        expect(navSection('/stats/readers/3')).toBe('/me');
        expect(navSection('/read/7')).toBeNull();
    });
});
