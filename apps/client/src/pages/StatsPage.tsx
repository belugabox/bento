import {
    Alert,
    Anchor,
    Badge,
    Button,
    Group,
    Progress,
    SimpleGrid,
    Stack,
    Table,
    Tabs,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { PageLoader } from '@/components/PageLoader';
import { UserAvatar } from '@/components/accounts/UserAvatar';
import { ageLabel, ageLimitLabel } from '@/components/ageLimits';
import {
    formatDuration,
    formatNumber,
    formatRelative,
    formatSize,
} from '@/components/format';
import { LibraryPanel } from '@/components/stats/LibraryPanel';
import { RankingsPanel } from '@/components/stats/RankingsPanel';
import { StatTile } from '@/components/stats/StatTile';
import {
    ActivityChart,
    HoursHeatmap,
    PeriodControl,
    ReadingCalendar,
    StatsSection,
} from '@/components/stats/StatsCharts';
import {
    DEFAULT_PERIOD,
    STATS_PERIODS,
    type StatsPeriod,
    isStatsPeriod,
    localDay,
} from '@/components/stats/statsData';
import { fetchReadingStats, fetchStats, scanLibrary } from '@/services/api';
import { useQuery } from '@/services/useQuery';

const Section = ({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) => (
    <Stack gap="xs">
        <Title order={4}>{title}</Title>
        {children}
    </Stack>
);

const STATS_TABS = ['reading', 'library', 'rankings'] as const;

/** Statistiques de la bibliothèque et de la lecture (admin). */
export const StatsPage = () => {
    const { data: stats, error, reload } = useQuery(fetchStats, []);
    // Période de la lecture, gardée dans l'adresse (retour depuis une fiche).
    const [params, setParams] = useSearchParams();
    const requested = params.get('period');
    const period: StatsPeriod = isStatsPeriod(requested)
        ? requested
        : DEFAULT_PERIOD;
    const requestedTab = params.get('tab');
    const tab = STATS_TABS.includes(requestedTab as never)
        ? requestedTab!
        : 'reading';
    const setParam = (name: 'tab' | 'period', value: string) =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.set(name, value);
                return next;
            },
            { replace: true },
        );
    const reading = useQuery(() => fetchReadingStats(period), [period]);
    const [scanning, setScanning] = useState<number>();
    const [scanReport, setScanReport] = useState<string>();

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!stats) return <PageLoader />;

    const totals = stats.libraries.reduce(
        (sum, l) => ({
            series: sum.series + l.series,
            volumes: sum.volumes + l.volumes,
            pages: sum.pages + l.pages,
            size: sum.size + l.size,
        }),
        { series: 0, volumes: 0, pages: 0, size: 0 },
    );
    const today = localDay(new Date());
    const periodLabel = STATS_PERIODS.find((p) => p.value === period)!.label;
    const periodReaders = reading.data?.readers ?? [];
    const sum = (field: 'seconds' | 'pages' | 'completed') =>
        periodReaders.reduce((n, r) => n + r[field], 0);
    const maxAgeOf = (id: number) => stats.readers.find((r) => r.id === id);

    // Séries par tranche d'âge, dans l'ordre des âges, puis sans classification.
    const ratingRows = [
        ...stats.ratings.flatMap((r) =>
            r.minAge === null
                ? []
                : [
                      {
                          label: ageLabel(r.minAge),
                          series: r.series,
                          unrated: false,
                      },
                  ],
        ),
        {
            label: 'Sans classification',
            series: stats.ratings.find((r) => r.minAge === null)?.series ?? 0,
            unrated: true,
        },
    ];
    const maxRating = Math.max(1, ...ratingRows.map((r) => r.series));

    const scan = async (libraryId: number) => {
        setScanning(libraryId);
        setScanReport(undefined);
        try {
            const result = await scanLibrary(libraryId);
            setScanReport(
                `${result.added} ajouté(s), ${result.updated} mis à jour, ${result.removed} retiré(s)` +
                    (result.errors.length
                        ? `, ${result.errors.length} illisible(s) : ${result.errors.map((e) => e.file).join(', ')}`
                        : '.'),
            );
            reload();
        } catch (e) {
            setScanReport((e as Error).message);
        } finally {
            setScanning(undefined);
        }
    };

    return (
        <Stack gap="xl">
            <PageHeader back="/me" title="Statistiques" />

            <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }}>
                <StatTile label="Séries" value={formatNumber(totals.series)} />
                <StatTile label="Tomes" value={formatNumber(totals.volumes)} />
                <StatTile label="Pages" value={formatNumber(totals.pages)} />
                <StatTile
                    label="Sur le disque"
                    value={formatSize(totals.size)}
                />
                <StatTile
                    label="Séries en attente"
                    value={formatNumber(stats.pendingDrafts)}
                    hint="dans les brouillons"
                    to="/drafts"
                />
            </SimpleGrid>

            <Tabs
                // Chaque onglet charge ses chiffres à son ouverture.
                keepMounted={false}
                value={tab}
                onChange={(value) => value && setParam('tab', value)}
            >
                <Group justify="space-between" gap="sm">
                    <Tabs.List>
                        <Tabs.Tab value="reading">Lecture</Tabs.Tab>
                        <Tabs.Tab value="library">Bibliothèque</Tabs.Tab>
                        <Tabs.Tab value="rankings">Classements</Tabs.Tab>
                    </Tabs.List>
                    {tab !== 'library' && (
                        <PeriodControl
                            value={period}
                            onChange={(value) => setParam('period', value)}
                        />
                    )}
                </Group>

                <Tabs.Panel value="reading" pt="lg">
                    <Stack gap="xl">
                        {reading.error ? (
                            <Alert color="red">{reading.error.message}</Alert>
                        ) : !reading.data ? (
                            <PageLoader />
                        ) : (
                            <>
                                <SimpleGrid cols={{ base: 2, sm: 4 }}>
                                    <StatTile
                                        label="Temps de lecture"
                                        value={formatDuration(sum('seconds'))}
                                        hint={periodLabel}
                                    />
                                    <StatTile
                                        label="Pages lues"
                                        value={formatNumber(sum('pages'))}
                                        hint={periodLabel}
                                    />
                                    <StatTile
                                        label="Tomes finis"
                                        value={formatNumber(sum('completed'))}
                                        hint={periodLabel}
                                    />
                                    <StatTile
                                        label="Lecteurs actifs"
                                        value={formatNumber(
                                            periodReaders.filter(
                                                (r) =>
                                                    r.seconds > 0 ||
                                                    r.completed > 0,
                                            ).length,
                                        )}
                                        hint={`sur ${periodReaders.length}`}
                                    />
                                </SimpleGrid>

                                <StatsSection title="Activité">
                                    <ActivityChart
                                        daily={reading.data.daily}
                                        period={period}
                                        start={reading.data.start}
                                        today={today}
                                        readers={periodReaders}
                                    />
                                </StatsSection>

                                <Table.ScrollContainer minWidth={640}>
                                    <Table verticalSpacing="xs">
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Personne</Table.Th>
                                                <Table.Th>
                                                    Séries visibles
                                                </Table.Th>
                                                <Table.Th ta="right">
                                                    Temps
                                                </Table.Th>
                                                <Table.Th ta="right">
                                                    Pages
                                                </Table.Th>
                                                <Table.Th ta="right">
                                                    Jours
                                                </Table.Th>
                                                <Table.Th ta="right">
                                                    Tomes finis
                                                </Table.Th>
                                                <Table.Th>
                                                    Dernière lecture
                                                </Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {periodReaders.map((r) => {
                                                const account = maxAgeOf(r.id);
                                                return (
                                                    <Table.Tr key={r.id}>
                                                        <Table.Td>
                                                            <Group
                                                                gap="xs"
                                                                wrap="nowrap"
                                                            >
                                                                <UserAvatar
                                                                    name={
                                                                        r.name
                                                                    }
                                                                    seed={
                                                                        r.avatarSeed
                                                                    }
                                                                    size={28}
                                                                />
                                                                <Anchor
                                                                    component={
                                                                        Link
                                                                    }
                                                                    to={`/stats/readers/${r.id}?period=${period}`}
                                                                    size="sm"
                                                                >
                                                                    {r.name}
                                                                </Anchor>
                                                            </Group>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            {r.role === 'admin'
                                                                ? 'Toutes (admin)'
                                                                : ageLimitLabel(
                                                                      account?.maxAge ??
                                                                          null,
                                                                  )}
                                                        </Table.Td>
                                                        <Table.Td ta="right">
                                                            {formatDuration(
                                                                r.seconds,
                                                            )}
                                                        </Table.Td>
                                                        <Table.Td ta="right">
                                                            {formatNumber(
                                                                r.pages,
                                                            )}
                                                        </Table.Td>
                                                        <Table.Td ta="right">
                                                            {r.days}
                                                        </Table.Td>
                                                        <Table.Td ta="right">
                                                            {r.completed}
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Text
                                                                size="sm"
                                                                c="dimmed"
                                                            >
                                                                {formatRelative(
                                                                    r.lastReadAt,
                                                                )}
                                                            </Text>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                );
                                            })}
                                        </Table.Tbody>
                                    </Table>
                                </Table.ScrollContainer>

                                <Stack gap="xl">
                                    <StatsSection title="Une année de lecture">
                                        <ReadingCalendar
                                            daily={reading.data.daily}
                                            today={today}
                                        />
                                    </StatsSection>
                                    <StatsSection
                                        title="Moments de lecture"
                                        hint="Séances dans Bento seulement : Kavita ne donnait pas l’heure."
                                    >
                                        <HoursHeatmap
                                            hours={reading.data.hours}
                                        />
                                    </StatsSection>
                                </Stack>
                            </>
                        )}

                        <Section title="Activité récente">
                            {stats.recent.length === 0 ? (
                                <Text size="sm" c="dimmed">
                                    Personne n’a encore lu.
                                </Text>
                            ) : (
                                <Stack gap={6}>
                                    {stats.recent.map((r) => (
                                        <Group
                                            key={`${r.userName}-${r.volumeId}`}
                                            justify="space-between"
                                            wrap="nowrap"
                                        >
                                            <Group
                                                gap={6}
                                                wrap="nowrap"
                                                miw={0}
                                            >
                                                <UserAvatar
                                                    name={r.userName}
                                                    seed={r.userAvatarSeed}
                                                    size={22}
                                                />
                                                <Text size="sm" lineClamp={1}>
                                                    <b>{r.userName}</b> ·{' '}
                                                    <Anchor
                                                        component={Link}
                                                        to={`/series/${r.seriesId}`}
                                                        size="sm"
                                                    >
                                                        {r.seriesName}
                                                        {r.number
                                                            ? ` T${r.number}`
                                                            : ''}
                                                    </Anchor>{' '}
                                                    <Text
                                                        span
                                                        size="sm"
                                                        c="dimmed"
                                                    >
                                                        {r.completed
                                                            ? 'lu'
                                                            : `p. ${r.page + 1}/${r.pageCount}`}
                                                    </Text>
                                                </Text>
                                            </Group>
                                            <Text
                                                size="xs"
                                                c="dimmed"
                                                style={{ whiteSpace: 'nowrap' }}
                                            >
                                                {formatRelative(r.updatedAt)}
                                            </Text>
                                        </Group>
                                    ))}
                                </Stack>
                            )}
                        </Section>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="library" pt="lg">
                    <Stack gap="xl">
                        <LibraryPanel />
                        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
                            <Section title="Classifications">
                                <Stack gap={6}>
                                    {ratingRows.map((row) => (
                                        <Group
                                            key={row.label}
                                            wrap="nowrap"
                                            gap="sm"
                                        >
                                            <Text
                                                size="sm"
                                                w={150}
                                                c={
                                                    row.unrated
                                                        ? 'orange'
                                                        : undefined
                                                }
                                            >
                                                {row.label}
                                            </Text>
                                            <Tooltip
                                                label={`${row.series} série${row.series > 1 ? 's' : ''}`}
                                            >
                                                <Progress
                                                    style={{ flex: 1 }}
                                                    size="lg"
                                                    radius="sm"
                                                    value={
                                                        (row.series /
                                                            maxRating) *
                                                        100
                                                    }
                                                    // Couleur d'accent du thème, orange pour l'alerte.
                                                    color={
                                                        row.unrated
                                                            ? 'orange'
                                                            : undefined
                                                    }
                                                    aria-label={`${row.label} : ${row.series} séries`}
                                                />
                                            </Tooltip>
                                            <Text size="sm" w={36} ta="right">
                                                {row.series}
                                            </Text>
                                        </Group>
                                    ))}
                                </Stack>
                                {ratingRows.at(-1)!.series > 0 && (
                                    <Text size="xs" c="dimmed">
                                        Les séries sans classification sont
                                        masquées aux comptes limités : classe
                                        leurs tomes dans l’éditeur de
                                        métadonnées.
                                    </Text>
                                )}
                            </Section>

                            <Section title="Statut des séries">
                                <SimpleGrid cols={3}>
                                    <StatTile
                                        label="En cours de parution"
                                        value={formatNumber(
                                            stats.statuses.ongoing,
                                        )}
                                    />
                                    <StatTile
                                        label="Terminées"
                                        value={formatNumber(
                                            stats.statuses.completed,
                                        )}
                                    />
                                    <StatTile
                                        label="Statut inconnu"
                                        value={formatNumber(
                                            stats.statuses.unknown,
                                        )}
                                    />
                                </SimpleGrid>
                            </Section>
                        </SimpleGrid>

                        <Section title="Bibliothèques">
                            {scanReport && (
                                <Alert
                                    withCloseButton
                                    onClose={() => setScanReport(undefined)}
                                >
                                    {scanReport}
                                </Alert>
                            )}
                            <Table.ScrollContainer minWidth={560}>
                                <Table verticalSpacing="xs">
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Bibliothèque</Table.Th>
                                            <Table.Th ta="right">
                                                Séries
                                            </Table.Th>
                                            <Table.Th ta="right">
                                                Tomes
                                            </Table.Th>
                                            <Table.Th ta="right">
                                                Taille
                                            </Table.Th>
                                            <Table.Th>Dernier scan</Table.Th>
                                            <Table.Th />
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {stats.libraries.map((l) => (
                                            <Table.Tr key={l.id}>
                                                <Table.Td>
                                                    {l.name}{' '}
                                                    <Badge
                                                        size="xs"
                                                        variant="light"
                                                        color="gray"
                                                    >
                                                        {l.type === 'manga'
                                                            ? 'Mangas'
                                                            : 'BD'}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td ta="right">
                                                    {formatNumber(l.series)}
                                                </Table.Td>
                                                <Table.Td ta="right">
                                                    {formatNumber(l.volumes)}
                                                </Table.Td>
                                                <Table.Td ta="right">
                                                    {formatSize(l.size)}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm" c="dimmed">
                                                        {formatRelative(
                                                            l.lastScanAt,
                                                        )}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td ta="right">
                                                    <Button
                                                        size="xs"
                                                        variant="default"
                                                        leftSection={
                                                            <IconRefresh
                                                                size={14}
                                                            />
                                                        }
                                                        loading={
                                                            scanning === l.id
                                                        }
                                                        disabled={
                                                            scanning !==
                                                            undefined
                                                        }
                                                        onClick={() =>
                                                            void scan(l.id)
                                                        }
                                                    >
                                                        Scanner
                                                    </Button>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        </Section>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="rankings" pt="lg">
                    <RankingsPanel period={period} />
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};
