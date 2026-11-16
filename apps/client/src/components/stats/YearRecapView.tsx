import {
    Anchor,
    Badge,
    Group,
    Image,
    Paper,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { Link } from 'react-router';

import { formatDuration, formatNumber } from '@/components/format';
import { type YearRecap, seriesCoverUrl } from '@/services/api';

import { StatTile } from './StatTile';
import { StatsSection } from './StatsCharts';

const WEEKDAY_NAMES = [
    'dimanche',
    'lundi',
    'mardi',
    'mercredi',
    'jeudi',
    'vendredi',
    'samedi',
];

const monthName = (month: string) =>
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
        month: 'long',
        timeZone: 'UTC',
    });

/** Une ligne du bilan : « Genre préféré » → « Action ». */
const Fact = ({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) => (
    <Paper withBorder radius="md" p="md">
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
        </Text>
        <Text size="md" fw={600} mt={4}>
            {children}
        </Text>
    </Paper>
);

const Cover = ({
    series,
    width,
}: {
    series: YearRecap['topSeries'][number];
    width: number;
}) => (
    <Image
        src={seriesCoverUrl(series, 'small')}
        w={width}
        h={width * 1.5}
        radius="sm"
        fit="cover"
        alt=""
        // Couverture absente : un cadre gris plutôt qu’une image cassée.
        fallbackSrc="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        bg="var(--mantine-color-default-hover)"
    />
);

/**
 * Bilan d'une année : chiffres, série de l'année et les suivantes, genre
 * préféré, mois le plus lu, moment préféré, découvertes, séries terminées.
 */
export const YearRecapView = ({ recap }: { recap: YearRecap }) => {
    if (recap.seconds === 0 && recap.completed === 0) {
        return <Text c="dimmed">Pas de lecture en {recap.year}.</Text>;
    }
    const [first, ...others] = recap.topSeries;
    const moment = recap.favouriteMoment;

    return (
        <Stack gap="xl">
            <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }}>
                <StatTile
                    label="Temps de lecture"
                    value={formatDuration(recap.seconds)}
                />
                <StatTile
                    label="Pages lues"
                    value={formatNumber(recap.pages)}
                />
                <StatTile
                    label="Tomes finis"
                    value={formatNumber(recap.completed)}
                />
                <StatTile
                    label="Jours de lecture"
                    value={formatNumber(recap.days)}
                />
                <StatTile
                    label="Jours d’affilée"
                    value={formatNumber(recap.bestStreak)}
                    hint="record de l’année"
                />
                <StatTile
                    label="Plus longue séance"
                    value={formatDuration(recap.longestSessionSeconds)}
                />
            </SimpleGrid>

            {first && (
                <StatsSection title={`Série de l’année ${recap.year}`}>
                    <Paper withBorder radius="md" p="md">
                        <Group align="flex-start" wrap="nowrap" gap="lg">
                            <Anchor component={Link} to={`/series/${first.id}`}>
                                <Cover series={first} width={110} />
                            </Anchor>
                            <Stack gap={4} style={{ minWidth: 0 }}>
                                <Anchor
                                    component={Link}
                                    to={`/series/${first.id}`}
                                    fw={700}
                                    size="xl"
                                >
                                    {first.name}
                                </Anchor>
                                <Text c="dimmed">
                                    {formatDuration(first.seconds)} de lecture
                                </Text>
                            </Stack>
                        </Group>
                    </Paper>
                    {others.length > 0 && (
                        <SimpleGrid cols={{ base: 2, sm: 4 }}>
                            {others.map((s, i) => (
                                <Anchor
                                    key={s.id}
                                    component={Link}
                                    to={`/series/${s.id}`}
                                    underline="never"
                                >
                                    <Group gap="sm" wrap="nowrap">
                                        <Cover series={s} width={44} />
                                        <div style={{ minWidth: 0 }}>
                                            <Text size="sm" lineClamp={2}>
                                                {i + 2}. {s.name}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {formatDuration(s.seconds)}
                                            </Text>
                                        </div>
                                    </Group>
                                </Anchor>
                            ))}
                        </SimpleGrid>
                    )}
                </StatsSection>
            )}

            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                {recap.genres[0] && (
                    <Fact label="Genre préféré">
                        {recap.genres[0].name}
                        {recap.genres.length > 1 && (
                            <Text span size="sm" c="dimmed" fw={400}>
                                {' '}
                                puis{' '}
                                {recap.genres
                                    .slice(1)
                                    .map((g) => g.name)
                                    .join(', ')}
                            </Text>
                        )}
                    </Fact>
                )}
                {recap.busiestMonth && (
                    <Fact label="Mois le plus lu">
                        {monthName(recap.busiestMonth.month)}
                        <Text span size="sm" c="dimmed" fw={400}>
                            {' '}
                            · {formatDuration(recap.busiestMonth.seconds)}
                        </Text>
                    </Fact>
                )}
                {moment && (
                    <Fact label="Moment préféré">
                        le {WEEKDAY_NAMES[moment.weekday]} vers {moment.hour} h
                    </Fact>
                )}
                <Fact label="Découvertes">
                    {recap.newSeries} nouvelle
                    {recap.newSeries > 1 ? 's' : ''} série
                    {recap.newSeries > 1 ? 's' : ''}
                    <Text span size="sm" c="dimmed" fw={400}>
                        {' '}
                        sur {recap.seriesCount} lue
                        {recap.seriesCount > 1 ? 's' : ''}
                    </Text>
                </Fact>
            </SimpleGrid>

            {recap.finished.length > 0 && (
                <StatsSection
                    title={`Séries terminées (${recap.finished.length})`}
                >
                    <Group gap="xs">
                        {recap.finished.map((s) => (
                            <Badge
                                key={s.id}
                                component={Link}
                                to={`/series/${s.id}`}
                                variant="light"
                                size="lg"
                                style={{
                                    cursor: 'pointer',
                                    textTransform: 'none',
                                }}
                            >
                                {s.name}
                            </Badge>
                        ))}
                    </Group>
                </StatsSection>
            )}
        </Stack>
    );
};
