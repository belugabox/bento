import {
    Alert,
    Anchor,
    Avatar,
    Group,
    Paper,
    Progress,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { Link } from 'react-router';

import { PageLoader } from '@/components/PageLoader';
import { UserAvatar } from '@/components/accounts/UserAvatar';
import { formatDuration, ratingLabel, reviewsLabel } from '@/components/format';
import { type ReadingRankings, fetchReadingRankings } from '@/services/api';
import { useQuery } from '@/services/useQuery';

import { StatsSection } from './StatsCharts';
import type { StatsPeriod } from './statsData';

const SeriesLink = ({ id, name }: { id: number; name: string }) => (
    <Anchor component={Link} to={`/series/${id}`} size="sm" lineClamp={1}>
        {name}
    </Anchor>
);

/** Une série notée : sa note, et ce qu'en a fait la famille. */
const RatedRow = ({
    series,
}: {
    series: ReadingRankings['bestRated'][number];
}) => (
    <Group justify="space-between" wrap="nowrap" gap="xs">
        <SeriesLink id={series.id} name={series.name} />
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {ratingLabel(series.rating)} ({reviewsLabel(series.reviews)}) ·{' '}
            {series.readers === 0
                ? 'jamais ouverte'
                : `${series.readers} lecteur${series.readers > 1 ? 's' : ''}` +
                  // Lectures sans séance enregistrée : pas de durée.
                  (series.seconds >= 60
                      ? `, ${formatDuration(series.seconds)}`
                      : '')}
        </Text>
    </Group>
);

/**
 * Classements de la période : séries les plus lues (en temps), celles de
 * chaque personne ; et les notes des sites face à la lecture de la famille.
 */
export const RankingsPanel = ({ period }: { period: StatsPeriod }) => {
    const { data, error } = useQuery(
        () => fetchReadingRankings(period),
        [period],
    );

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!data) return <PageLoader />;

    const max = Math.max(1, ...data.topSeries.map((s) => s.seconds));

    return (
        <Stack gap="xl">
            <StatsSection
                title="Séries les plus lues"
                hint="Temps de lecture de la famille sur la période"
            >
                {data.topSeries.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        Aucune lecture sur cette période.
                    </Text>
                ) : (
                    <Stack gap="sm">
                        {data.topSeries.map((s, index) => (
                            <div key={s.id}>
                                <Group
                                    justify="space-between"
                                    wrap="nowrap"
                                    gap="xs"
                                >
                                    <Group gap="xs" wrap="nowrap" miw={0}>
                                        <Text
                                            size="sm"
                                            c="dimmed"
                                            w={22}
                                            ta="right"
                                        >
                                            {index + 1}
                                        </Text>
                                        <SeriesLink id={s.id} name={s.name} />
                                    </Group>
                                    <Group gap="xs" wrap="nowrap">
                                        <Avatar.Group spacing={6}>
                                            {s.readers.map((reader) => (
                                                <UserAvatar
                                                    key={reader.id}
                                                    name={reader.name}
                                                    seed={reader.avatarSeed}
                                                    size={22}
                                                />
                                            ))}
                                        </Avatar.Group>
                                        <Text
                                            size="sm"
                                            c="dimmed"
                                            w={60}
                                            ta="right"
                                        >
                                            {formatDuration(s.seconds)}
                                        </Text>
                                    </Group>
                                </Group>
                                <Progress
                                    size="xs"
                                    mt={4}
                                    value={(s.seconds / max) * 100}
                                    aria-label={`${s.name} : ${formatDuration(s.seconds)}`}
                                />
                            </div>
                        ))}
                    </Stack>
                )}
            </StatsSection>

            {data.perReader.length > 0 && (
                <StatsSection title="Par personne">
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                        {data.perReader.map((reader) => (
                            <Paper
                                key={reader.id}
                                withBorder
                                radius="md"
                                p="md"
                            >
                                <Group gap="sm" mb="xs" wrap="nowrap">
                                    <UserAvatar
                                        name={reader.name}
                                        seed={reader.avatarSeed}
                                        size={32}
                                    />
                                    <div style={{ minWidth: 0 }}>
                                        <Anchor
                                            component={Link}
                                            to={`/stats/readers/${reader.id}?period=${period}`}
                                            size="sm"
                                            fw={600}
                                        >
                                            {reader.name}
                                        </Anchor>
                                        <Text size="xs" c="dimmed">
                                            {formatDuration(reader.seconds)}
                                        </Text>
                                    </div>
                                </Group>
                                <Stack gap={4}>
                                    {reader.series.map((s) => (
                                        <Group
                                            key={s.id}
                                            justify="space-between"
                                            wrap="nowrap"
                                            gap="xs"
                                        >
                                            <SeriesLink
                                                id={s.id}
                                                name={s.name}
                                            />
                                            <Text
                                                size="xs"
                                                c="dimmed"
                                                style={{ whiteSpace: 'nowrap' }}
                                            >
                                                {formatDuration(s.seconds)}
                                            </Text>
                                        </Group>
                                    ))}
                                </Stack>
                            </Paper>
                        ))}
                    </SimpleGrid>
                </StatsSection>
            )}

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
                <StatsSection
                    title="Les mieux notées"
                    hint="Notes des sites (10 avis au moins), et la lecture de la famille depuis toujours"
                >
                    {data.bestRated.length === 0 ? (
                        <Text size="sm" c="dimmed">
                            Aucune série notée : remplis leurs fiches en ligne.
                        </Text>
                    ) : (
                        <Stack gap={6}>
                            {data.bestRated.map((s) => (
                                <RatedRow key={s.id} series={s} />
                            ))}
                        </Stack>
                    )}
                </StatsSection>
                <StatsSection
                    title="Bien notées, jamais ouvertes"
                    hint="4 sur 5 au moins : de quoi donner des idées"
                >
                    {data.unreadGems.length === 0 ? (
                        <Text size="sm" c="dimmed">
                            Aucune : la famille a tout essayé.
                        </Text>
                    ) : (
                        <Stack gap={6}>
                            {data.unreadGems.map((s) => (
                                <RatedRow key={s.id} series={s} />
                            ))}
                        </Stack>
                    )}
                </StatsSection>
            </SimpleGrid>
        </Stack>
    );
};
