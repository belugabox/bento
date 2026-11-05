import {
    Alert,
    Anchor,
    Badge,
    Button,
    Group,
    Loader,
    Paper,
    Progress,
    SimpleGrid,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { AGE_GROUPS, ageLimitLabel } from '@/components/ageLimits';
import { formatNumber, formatRelative, formatSize } from '@/components/format';
import { fetchStats, scanLibrary } from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Chiffre clé : valeur en grand, libellé en dessous. */
const StatTile = ({
    label,
    value,
    hint,
    to,
}: {
    label: string;
    value: string;
    hint?: string;
    to?: string;
}) => (
    <Paper withBorder radius="md" p="md">
        <Text size="xl" fw={700} lh={1.1}>
            {to ? (
                <Anchor component={Link} to={to} inherit c="inherit">
                    {value}
                </Anchor>
            ) : (
                value
            )}
        </Text>
        <Text size="sm" c="dimmed">
            {label}
        </Text>
        {hint && (
            <Text size="xs" c="dimmed">
                {hint}
            </Text>
        )}
    </Paper>
);

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

/** Statistiques de la bibliothèque et de la lecture (admin). */
export const StatsPage = () => {
    const { data: stats, error, reload } = useQuery(fetchStats, []);
    const [scanning, setScanning] = useState<number>();
    const [scanReport, setScanReport] = useState<string>();

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!stats) return <Loader mx="auto" />;

    const totals = stats.libraries.reduce(
        (sum, l) => ({
            series: sum.series + l.series,
            volumes: sum.volumes + l.volumes,
            pages: sum.pages + l.pages,
            size: sum.size + l.size,
        }),
        { series: 0, volumes: 0, pages: 0, size: 0 },
    );
    const readers = stats.readers.filter((r) => r.role === 'reader');
    const read = stats.readers.reduce((n, r) => n + r.completed, 0);
    const inProgress = stats.readers.reduce((n, r) => n + r.inProgress, 0);

    // Séries par tranche d'âge, dans l'ordre des âges, puis sans classification.
    const ratingRows = [
        ...AGE_GROUPS.map((group) => ({
            label: group.label,
            series:
                stats.ratings.find((r) => r.minAge === group.age)?.series ?? 0,
            unrated: false,
        })),
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
            <Title order={2}>Statistiques</Title>

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

            <Section title="Lecture">
                <SimpleGrid cols={{ base: 2, sm: 3 }}>
                    <StatTile label="Tomes lus" value={formatNumber(read)} />
                    <StatTile
                        label="Tomes en cours"
                        value={formatNumber(inProgress)}
                    />
                    <StatTile
                        label="Lecteurs"
                        value={formatNumber(readers.length)}
                    />
                </SimpleGrid>
                <Table.ScrollContainer minWidth={520}>
                    <Table verticalSpacing="xs">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Personne</Table.Th>
                                <Table.Th>Séries visibles</Table.Th>
                                <Table.Th ta="right">Lus</Table.Th>
                                <Table.Th ta="right">En cours</Table.Th>
                                <Table.Th>Dernière lecture</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {stats.readers.map((r) => (
                                <Table.Tr key={r.id}>
                                    <Table.Td>{r.name}</Table.Td>
                                    <Table.Td>
                                        {r.role === 'admin'
                                            ? 'Toutes (admin)'
                                            : ageLimitLabel(r.maxAge)}
                                    </Table.Td>
                                    <Table.Td ta="right">
                                        {r.completed}
                                    </Table.Td>
                                    <Table.Td ta="right">
                                        {r.inProgress}
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {formatRelative(r.lastReadAt)}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Section>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
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
                                    <Text size="sm" lineClamp={1}>
                                        <b>{r.userName}</b> ·{' '}
                                        <Anchor
                                            component={Link}
                                            to={`/series/${r.seriesId}`}
                                            size="sm"
                                        >
                                            {r.seriesName}
                                            {r.number ? ` T${r.number}` : ''}
                                        </Anchor>{' '}
                                        <Text span size="sm" c="dimmed">
                                            {r.completed
                                                ? 'lu'
                                                : `p. ${r.page + 1}/${r.pageCount}`}
                                        </Text>
                                    </Text>
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

                <Section title="Séries les plus lues">
                    {stats.topSeries.length === 0 ? (
                        <Text size="sm" c="dimmed">
                            Pas encore de lecture.
                        </Text>
                    ) : (
                        <Stack gap={6}>
                            {stats.topSeries.map((s) => (
                                <Group key={s.id} justify="space-between">
                                    <Anchor
                                        component={Link}
                                        to={`/series/${s.id}`}
                                        size="sm"
                                    >
                                        {s.name}
                                    </Anchor>
                                    <Text size="sm" c="dimmed">
                                        {s.readers} lecteur
                                        {s.readers > 1 ? 's' : ''} ·{' '}
                                        {s.completed} tome
                                        {s.completed > 1 ? 's' : ''} lu
                                        {s.completed > 1 ? 's' : ''}
                                    </Text>
                                </Group>
                            ))}
                        </Stack>
                    )}
                </Section>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
                <Section title="Classifications">
                    <Stack gap={6}>
                        {ratingRows.map((row) => (
                            <Group key={row.label} wrap="nowrap" gap="sm">
                                <Text
                                    size="sm"
                                    w={150}
                                    c={row.unrated ? 'orange' : undefined}
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
                                        value={(row.series / maxRating) * 100}
                                        color={row.unrated ? 'orange' : 'teal'}
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
                            Les séries sans classification sont masquées aux
                            comptes limités : classe leurs tomes dans l’éditeur
                            de métadonnées.
                        </Text>
                    )}
                </Section>

                <Section title="Statut des séries">
                    <SimpleGrid cols={3}>
                        <StatTile
                            label="En cours de parution"
                            value={formatNumber(stats.statuses.ongoing)}
                        />
                        <StatTile
                            label="Terminées"
                            value={formatNumber(stats.statuses.completed)}
                        />
                        <StatTile
                            label="Statut inconnu"
                            value={formatNumber(stats.statuses.unknown)}
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
                                <Table.Th ta="right">Séries</Table.Th>
                                <Table.Th ta="right">Tomes</Table.Th>
                                <Table.Th ta="right">Taille</Table.Th>
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
                                            {formatRelative(l.lastScanAt)}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td ta="right">
                                        <Button
                                            size="xs"
                                            variant="default"
                                            leftSection={
                                                <IconRefresh size={14} />
                                            }
                                            loading={scanning === l.id}
                                            disabled={scanning !== undefined}
                                            onClick={() => void scan(l.id)}
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
    );
};
