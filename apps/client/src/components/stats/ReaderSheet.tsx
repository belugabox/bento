import {
    Anchor,
    Button,
    Group,
    Paper,
    Progress,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';

import {
    formatDuration,
    formatNumber,
    formatRelative,
} from '@/components/format';
import { volumeLabel } from '@/components/readingStatus';
import type { ReaderStats } from '@/services/api';

import { StatTile } from './StatTile';
import {
    ActivityChart,
    HoursHeatmap,
    RankBars,
    ReadingCalendar,
    StatsSection,
} from './StatsCharts';
import { type StatsPeriod, localDay } from './statsData';

// Historique : les plus récents d'abord, le reste sur demande.
const HISTORY_SHOWN = 20;

const SERIES_STATES = [
    { state: 'reading', title: 'En cours' },
    { state: 'finished', title: 'Terminées' },
    {
        state: 'abandoned',
        title: 'Abandonnées',
        hint: 'Pas finies, pas ouvertes depuis 2 mois.',
    },
] as const;

const SeriesList = ({ series }: { series: ReaderStats['series'] }) => (
    <Stack gap={8}>
        {series.map((s) => (
            <div key={s.id}>
                <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Anchor
                        component={Link}
                        to={`/series/${s.id}`}
                        size="sm"
                        lineClamp={1}
                    >
                        {s.name}
                    </Anchor>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                        {s.read} / {s.volumes} · {formatDuration(s.seconds)} ·{' '}
                        {formatRelative(s.lastReadAt)}
                    </Text>
                </Group>
                <Progress
                    size="xs"
                    value={s.volumes ? (s.read / s.volumes) * 100 : 0}
                    aria-label={`${s.name} : ${s.read} tomes lus sur ${s.volumes}`}
                />
            </div>
        ))}
    </Stack>
);

/**
 * Lecture d'une personne sur la période : ses chiffres, son activité, ses
 * genres et formats, ses séries et son historique (fiche de l'admin et
 * « Mes statistiques »).
 */
export const ReaderSheet = ({
    data,
    period,
}: {
    data: ReaderStats;
    period: StatsPeriod;
}) => {
    const [allHistory, setAllHistory] = useState(false);
    const today = localDay(new Date());
    const history = allHistory
        ? data.history
        : data.history.slice(0, HISTORY_SHOWN);

    return (
        <Stack gap="xl">
            <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }}>
                <StatTile
                    label="Temps de lecture"
                    value={formatDuration(data.seconds)}
                />
                <StatTile label="Pages lues" value={formatNumber(data.pages)} />
                <StatTile
                    label="Tomes finis"
                    value={formatNumber(data.completed)}
                />
                <StatTile
                    label="Séances"
                    value={formatNumber(data.sessions)}
                    hint={
                        data.sessions
                            ? `${formatDuration(data.averageSessionSeconds)} en moyenne`
                            : undefined
                    }
                />
                <StatTile
                    label="Pages par minute"
                    value={
                        data.pagesPerMinute === null
                            ? '—'
                            : data.pagesPerMinute.toLocaleString('fr-FR')
                    }
                />
                <StatTile
                    label="Jours d’affilée"
                    value={formatNumber(data.streaks.current)}
                    hint={`record : ${data.streaks.best} · ${data.days} jour${data.days > 1 ? 's' : ''} de lecture`}
                />
            </SimpleGrid>

            <StatsSection title="Activité">
                <ActivityChart
                    daily={data.daily}
                    period={period}
                    start={data.start}
                    today={today}
                    readers={[{ id: data.id, name: data.name }]}
                />
            </StatsSection>

            <Stack gap="xl">
                <StatsSection title="Une année de lecture">
                    <ReadingCalendar daily={data.daily} today={today} />
                </StatsSection>
                <StatsSection
                    title="Moments de lecture"
                    hint="Séances dans Bento seulement : Kavita ne donnait pas l’heure."
                >
                    <HoursHeatmap hours={data.hours} />
                </StatsSection>
            </Stack>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
                <StatsSection title="Genres préférés" hint="Temps de lecture">
                    <RankBars
                        rows={data.genres.map(({ name, seconds }) => ({
                            name,
                            value: seconds,
                        }))}
                        empty="Aucune lecture sur cette période."
                    />
                </StatsSection>
                <StatsSection title="Formats" hint="Temps de lecture">
                    <RankBars
                        rows={data.formats.map(({ name, seconds }) => ({
                            name,
                            value: seconds,
                        }))}
                        empty="Aucune lecture sur cette période."
                    />
                </StatsSection>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
                {SERIES_STATES.map(({ state, title, ...rest }) => {
                    const series = data.series.filter((s) => s.state === state);
                    return (
                        <StatsSection
                            key={state}
                            title={`${title} (${series.length})`}
                            hint={'hint' in rest ? rest.hint : undefined}
                        >
                            {series.length === 0 ? (
                                <Text size="sm" c="dimmed">
                                    Aucune.
                                </Text>
                            ) : (
                                <SeriesList series={series} />
                            )}
                        </StatsSection>
                    );
                })}
            </SimpleGrid>

            <StatsSection title="Historique">
                {data.history.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        Pas encore de lecture.
                    </Text>
                ) : (
                    <Paper withBorder radius="md" p="sm">
                        <Stack gap={6}>
                            {history.map((h) => (
                                <Group
                                    key={h.volumeId}
                                    justify="space-between"
                                    wrap="nowrap"
                                >
                                    <Text size="sm" lineClamp={1}>
                                        <Anchor
                                            component={Link}
                                            to={`/series/${h.seriesId}`}
                                            size="sm"
                                        >
                                            {h.seriesName}
                                        </Anchor>{' '}
                                        ·{' '}
                                        {volumeLabel({
                                            number: h.number,
                                            title: null,
                                            kind: h.kind,
                                        })}{' '}
                                        <Text span size="sm" c="dimmed">
                                            {h.completed
                                                ? 'lu'
                                                : `p. ${h.page + 1}/${h.pageCount}`}
                                            {h.seconds > 0 &&
                                                ` · ${formatDuration(h.seconds)}`}
                                        </Text>
                                    </Text>
                                    <Text
                                        size="xs"
                                        c="dimmed"
                                        style={{ whiteSpace: 'nowrap' }}
                                    >
                                        {formatRelative(h.updatedAt)}
                                    </Text>
                                </Group>
                            ))}
                            {!allHistory &&
                                data.history.length > HISTORY_SHOWN && (
                                    <Button
                                        variant="subtle"
                                        size="xs"
                                        onClick={() => setAllHistory(true)}
                                    >
                                        Tout afficher ({data.history.length})
                                    </Button>
                                )}
                        </Stack>
                    </Paper>
                )}
            </StatsSection>
        </Stack>
    );
};
