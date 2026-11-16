import { BarChart } from '@mantine/charts';
import {
    Alert,
    Anchor,
    Button,
    Group,
    Loader,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';

import { formatRelative, formatSize } from '@/components/format';
import { fetchLibraryStats } from '@/services/api';
import { useQuery } from '@/services/useQuery';

import { RankBars, StatsSection } from './StatsCharts';

// Séries jamais ouvertes : les premières, puis toutes sur demande.
const DORMANT_SHOWN = 10;
// Genres comparés (les plus présents).
const GENRES_SHOWN = 10;

const seriesCount = (n: number) => `${n} série${n > 1 ? 's' : ''}`;
const volumeCount = (n: number) => `${n} tome${n > 1 ? 's' : ''}`;

const monthLabel = (month: string) =>
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
    });

/** Part de chaque valeur dans le total, en pour cent. */
const shares = <T,>(rows: T[], value: (row: T) => number) => {
    const total = rows.reduce((sum, row) => sum + value(row), 0);
    return (row: T) =>
        total > 0 ? Math.round((value(row) / total) * 1000) / 10 : 0;
};

/**
 * La bibliothèque en chiffres : tomes ajoutés par mois, formats, genres
 * possédés face aux genres lus, éditeurs, auteurs, séries jamais ouvertes.
 */
export const LibraryPanel = () => {
    const { data, error } = useQuery(fetchLibraryStats, []);
    const [allDormant, setAllDormant] = useState(false);

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!data) return <Loader mx="auto" />;

    const genres = data.genres.slice(0, GENRES_SHOWN);
    const ownedShare = shares(data.genres, (g) => g.series);
    const readShare = shares(data.genres, (g) => g.seconds);
    const dormantSize = data.dormant.reduce((sum, s) => sum + s.size, 0);
    const dormant = allDormant
        ? data.dormant
        : data.dormant.slice(0, DORMANT_SHOWN);

    return (
        <Stack gap="xl">
            <StatsSection
                title="Croissance"
                hint="Tomes et séries ajoutés chaque mois"
            >
                {data.growth.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        Aucun tome.
                    </Text>
                ) : (
                    <>
                        <BarChart
                            h={200}
                            maxBarWidth={48}
                            data={data.growth.map((row) => ({
                                ...row,
                                label: monthLabel(row.month),
                            }))}
                            dataKey="label"
                            series={[
                                {
                                    name: 'volumes',
                                    label: 'Tomes ajoutés',
                                    color: 'blue.6',
                                },
                            ]}
                        />
                        <Text size="xs" c="dimmed">
                            {data.growth
                                .slice(-3)
                                .reverse()
                                .map(
                                    (row) =>
                                        `${monthLabel(row.month)} : ${volumeCount(row.volumes)}, ${seriesCount(row.series)} nouvelle${row.series > 1 ? 's' : ''}, ${formatSize(row.size)}`,
                                )
                                .join(' · ')}
                        </Text>
                    </>
                )}
            </StatsSection>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
                <StatsSection title="Formats" hint="Place sur le disque">
                    <RankBars
                        rows={data.formats.map((f) => ({
                            name: f.name,
                            value: f.size,
                        }))}
                        format={formatSize}
                        empty="Aucune série."
                    />
                    <Text size="xs" c="dimmed">
                        {data.formats
                            .map(
                                (f) =>
                                    `${f.name} : ${seriesCount(f.series)}, ${volumeCount(f.volumes)}`,
                            )
                            .join(' · ')}
                    </Text>
                </StatsSection>

                <StatsSection
                    title="Genres possédés et lus"
                    hint="Part des séries de la bibliothèque, et part du temps de lecture de la famille"
                >
                    {genres.length === 0 ? (
                        <Text size="sm" c="dimmed">
                            Aucun genre.
                        </Text>
                    ) : (
                        <BarChart
                            h={40 + genres.length * 34}
                            orientation="vertical"
                            data={genres.map((g) => ({
                                name: g.name,
                                owned: ownedShare(g),
                                read: readShare(g),
                            }))}
                            dataKey="name"
                            withLegend
                            valueFormatter={(value) =>
                                `${value.toLocaleString('fr-FR')} %`
                            }
                            yAxisProps={{ width: 110 }}
                            series={[
                                {
                                    name: 'owned',
                                    label: 'Séries',
                                    color: 'gray.6',
                                },
                                {
                                    name: 'read',
                                    label: 'Lecture',
                                    color: 'blue.6',
                                },
                            ]}
                        />
                    )}
                </StatsSection>

                <StatsSection title="Éditeurs" hint="Nombre de séries">
                    <RankBars
                        rows={data.publishers.map((p) => ({
                            name: p.name,
                            value: p.series,
                        }))}
                        limit={10}
                        format={seriesCount}
                        empty="Aucun éditeur dans les fiches."
                    />
                </StatsSection>

                <StatsSection
                    title="Auteurs"
                    hint="Scénario ou dessin, nombre de séries"
                >
                    <RankBars
                        rows={data.authors.map((a) => ({
                            name: a.name,
                            value: a.series,
                        }))}
                        limit={10}
                        format={seriesCount}
                        empty="Aucun auteur dans les fiches."
                    />
                </StatsSection>
            </SimpleGrid>

            <StatsSection
                title={`Jamais ouvertes (${data.dormant.length})`}
                hint={
                    data.dormant.length > 0
                        ? `Personne n’a ouvert ces séries : ${formatSize(dormantSize)}. Les plus anciennes d’abord.`
                        : undefined
                }
            >
                {data.dormant.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        Toutes les séries ont été ouvertes au moins une fois.
                    </Text>
                ) : (
                    <Stack gap={6}>
                        {dormant.map((s) => (
                            <Group
                                key={s.id}
                                justify="space-between"
                                wrap="nowrap"
                            >
                                <Anchor
                                    component={Link}
                                    to={`/series/${s.id}`}
                                    size="sm"
                                    lineClamp={1}
                                >
                                    {s.name}
                                </Anchor>
                                <Text
                                    size="xs"
                                    c="dimmed"
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    {volumeCount(s.volumes)} ·{' '}
                                    {formatSize(s.size)} · ajoutée{' '}
                                    {formatRelative(s.addedAt)}
                                </Text>
                            </Group>
                        ))}
                        {!allDormant && data.dormant.length > DORMANT_SHOWN && (
                            <Button
                                variant="subtle"
                                size="xs"
                                onClick={() => setAllDormant(true)}
                            >
                                Tout afficher ({data.dormant.length})
                            </Button>
                        )}
                    </Stack>
                )}
            </StatsSection>
        </Stack>
    );
};
