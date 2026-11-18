import { SimpleGrid, useMatches } from '@mantine/core';
import type { ReactNode } from 'react';

import { PageSection } from '@/components/PageSection';
import { SeriesCard } from '@/components/SeriesCard';
import { gridColumns, useLibraryDisplay } from '@/components/libraryDisplay';
import type { SeriesSummary } from '@/services/api';

/**
 * Bloc d'une ligne de cartes (accueil, fiche série) : autant que la grille
 * en met côte à côte, chaque carte avec sa raison sous le nom (« Parce
 * que tu as lu Spirale ») ; rien sans série.
 */
export const SuggestionRow = ({
    title,
    count,
    more,
    items,
    isAdmin,
    onChanged,
    tag,
    smaller = false,
}: {
    title: string;
    /** Nombre affiché à côté du titre (aucun sans). */
    count?: number;
    /** Adresse de « Tout voir ». */
    more?: string;
    items: { series: SeriesSummary; reason?: string }[];
    isAdmin: boolean;
    onChanged: () => void;
    /** En haut à gauche de la couverture (avatars…). */
    tag?: (series: SeriesSummary) => ReactNode;
    /** Cartes un cran plus petites que l'affichage choisi (fiche série). */
    smaller?: boolean;
}) => {
    const display = useLibraryDisplay();
    const columns = gridColumns(
        smaller ? Math.max(display.size - 1, 0) : display.size,
    );
    const perRow = useMatches(columns);
    if (items.length === 0) return null;
    return (
        <PageSection title={title} count={count} more={more}>
            <SimpleGrid cols={columns} spacing="sm">
                {items.slice(0, perRow).map(({ series, reason }) => (
                    <SeriesCard
                        key={series.id}
                        series={series}
                        isAdmin={isAdmin}
                        onChanged={onChanged}
                        coversOnly={display.coversOnly}
                        subtitle={reason}
                        // Une raison a deux lignes (entière au survol).
                        subtitleLines={reason ? 2 : 1}
                        tag={tag?.(series)}
                    />
                ))}
            </SimpleGrid>
        </PageSection>
    );
};
