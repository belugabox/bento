import { Alert, SimpleGrid, Stack, Text } from '@mantine/core';
import { useContext } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { PageLoader } from '@/components/PageLoader';
import { SeriesCard } from '@/components/SeriesCard';
import { gridColumns, useLibraryDisplay } from '@/components/libraryDisplay';
import { forYou } from '@/components/suggestions';
import { fetchSeriesList } from '@/services/api';
import { UserContext } from '@/services/auth';
import { useQuery } from '@/services/useQuery';

// Assez pour choisir, pas toute la bibliothèque.
const FOR_YOU_LIMIT = 48;

/**
 * « Tout voir » de « Pour toi » : toutes les suggestions d'après ce que la
 * personne lit, chacune avec sa raison (la bibliothèque ne saurait pas les
 * montrer) ; sans celles retirées (« Pas pour moi »).
 */
export const ForYouPage = () => {
    const isAdmin = useContext(UserContext)?.role === 'admin';
    const display = useLibraryDisplay();
    const series = useQuery(() => fetchSeriesList(), [], {
        cacheKey: 'series:all',
    });
    if (series.error) {
        return <Alert color="red">{series.error.message}</Alert>;
    }
    if (!series.data) return <PageLoader />;
    const suggestions = forYou(series.data, { limit: FOR_YOU_LIMIT }).filter(
        (s) => !s.series.notForMe,
    );
    return (
        <Stack>
            <PageHeader
                back="/"
                backLabel="Retour à l’accueil"
                title="Pour toi"
                description="D’après ce que tu lis : les séries les plus proches d’abord."
            />
            {suggestions.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">
                    Rien à proposer tant que tu n’as rien lu.
                </Text>
            ) : (
                <SimpleGrid
                    cols={gridColumns(display.size)}
                    spacing="sm"
                    data-testid="for-you"
                >
                    {suggestions.map(({ series: s, reason }) => (
                        <SeriesCard
                            key={s.id}
                            series={s}
                            isAdmin={isAdmin}
                            onChanged={series.reload}
                            coversOnly={display.coversOnly}
                            subtitle={reason}
                            subtitleLines={2}
                        />
                    ))}
                </SimpleGrid>
            )}
        </Stack>
    );
};
