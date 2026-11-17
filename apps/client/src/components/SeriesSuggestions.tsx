import { Stack } from '@mantine/core';

import { SuggestionRow } from '@/components/SuggestionRow';
import { libraryLink } from '@/components/libraryFilters';
import { sameAuthorSeries, similarSeries } from '@/components/suggestions';
import { fetchSeriesList } from '@/services/api';
import { useQuery } from '@/services/useQuery';

/**
 * Sous les tomes d'une série : « Du même auteur » (scénario ou dessin en
 * commun), puis « Dans le même genre » (genres et thèmes partagés), chacun
 * sur une ligne, avec la raison sous chaque carte. Calculés d'après la
 * liste des séries (celle de l'accueil, gardée en mémoire) ; rien s'il n'y
 * a pas de suggestion.
 */
export const SeriesSuggestions = ({
    seriesId,
    isAdmin,
}: {
    seriesId: number;
    isAdmin: boolean;
}) => {
    const { data, reload } = useQuery(() => fetchSeriesList(), [], {
        cacheKey: 'series:all',
    });
    const target = data?.find((s) => s.id === seriesId);
    if (!data || !target) return null;
    const sameAuthor = sameAuthorSeries(target, data);
    // Un même auteur ne revient pas dans le bloc d'après.
    const shown = new Set(sameAuthor.map((s) => s.series.id));
    const similar = similarSeries(target, data).filter(
        (s) => !shown.has(s.series.id),
    );
    const author = sameAuthor[0]?.reason;
    return (
        <Stack gap="xl" mt="md">
            <SuggestionRow
                title="Du même auteur"
                count={sameAuthor.length}
                // La recherche trouve aussi les auteurs.
                more={author ? libraryLink({}, { q: author }) : undefined}
                items={sameAuthor}
                isAdmin={isAdmin}
                onChanged={reload}
            />
            <SuggestionRow
                title="Dans le même genre"
                items={similar}
                isAdmin={isAdmin}
                onChanged={reload}
            />
        </Stack>
    );
};
