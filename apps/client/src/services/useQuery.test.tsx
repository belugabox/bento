import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useQuery } from './useQuery';

/** Affiche la donnée chargée, ou « Chargement ». */
const Show = ({
    load,
    cacheKey,
}: {
    load: () => Promise<string>;
    cacheKey?: string;
}) => {
    const { data, loading } = useQuery(load, [], { cacheKey });
    return <p>{loading && !data ? 'Chargement' : data}</p>;
};

describe('useQuery', () => {
    it('shows the last answer at once when coming back, then the new one', async () => {
        const first = render(
            <Show load={async () => 'avant'} cacheKey="liste" />,
        );
        expect(await screen.findByText('avant')).toBeTruthy();
        first.unmount();

        // Retour : l'ancienne réponse tout de suite, sans « Chargement ».
        let answer: (value: string) => void = () => {};
        render(
            <Show
                load={() => new Promise((resolve) => (answer = resolve))}
                cacheKey="liste"
            />,
        );
        expect(screen.getByText('avant')).toBeTruthy();
        answer('après');
        expect(await screen.findByText('après')).toBeTruthy();
    });

    it('waits for the answer without a cache key', async () => {
        render(<Show load={async () => 'donnée'} />);
        expect(screen.getByText('Chargement')).toBeTruthy();
        expect(await screen.findByText('donnée')).toBeTruthy();
    });
});
