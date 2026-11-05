import {
    Alert,
    Box,
    Chip,
    Group,
    Loader,
    ScrollArea,
    SegmentedControl,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    ThemeIcon,
    Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { CoverCard } from '@/components/CoverCard';
import { volumeLabel } from '@/components/readingStatus';
import {
    READING_FILTERS,
    type ReadingFilter,
    SERIES_SORTS,
    type SeriesSort,
    filterSeries,
    readingStateOf,
} from '@/components/seriesFilters';
import {
    coverUrl,
    fetchInProgress,
    fetchLibraries,
    fetchSeriesList,
    seriesCoverUrl,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

// Largeur des vignettes de « Reprendre la lecture » (défilement horizontal).
const RESUME_CARD_WIDTH = 132;

/** Accueil : reprendre la lecture, puis toutes les séries. */
export const LibraryPage = () => {
    // Bibliothèque, recherche, filtre et tri dans l'adresse : le retour
    // arrière les garde.
    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState(params.get('q') ?? '');
    const [debouncedSearch] = useDebouncedValue(search, 250);
    const filter = (params.get('filter') as ReadingFilter | null) ?? 'all';
    const sort = (params.get('sort') as SeriesSort | null) ?? 'name';

    const libraries = useQuery(fetchLibraries, []);
    const inProgress = useQuery(fetchInProgress, []);
    const libraryId =
        Number(params.get('library')) || libraries.data?.[0]?.id || undefined;
    const series = useQuery(
        () =>
            libraryId
                ? fetchSeriesList({ libraryId, search: debouncedSearch })
                : Promise.resolve(undefined),
        [libraryId, debouncedSearch],
    );

    const update = (key: string, value: string, fallback = '') =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                if (value && value !== fallback) next.set(key, value);
                else next.delete(key);
                return next;
            },
            { replace: true },
        );

    if (libraries.error) {
        return <Alert color="red">{libraries.error.message}</Alert>;
    }
    if (libraries.data?.length === 0) {
        return (
            <Alert color="yellow" title="Aucune bibliothèque">
                Déclarez vos dossiers dans la variable LIBRARIES du serveur.
            </Alert>
        );
    }

    const visible = filterSeries(series.data ?? [], { filter, sort });
    const resume = debouncedSearch ? [] : (inProgress.data ?? []);

    return (
        <Stack gap="xl">
            <Group justify="space-between" gap="sm">
                {libraries.data && libraries.data.length > 1 ? (
                    <SegmentedControl
                        value={String(libraryId)}
                        onChange={(value) => update('library', value)}
                        data={libraries.data.map((library) => ({
                            value: String(library.id),
                            label: library.name,
                        }))}
                    />
                ) : (
                    <Title order={2}>{libraries.data?.[0]?.name}</Title>
                )}
                <TextInput
                    w={{ base: '100%', xs: 260 }}
                    placeholder="Rechercher une série"
                    leftSection={<IconSearch size={16} />}
                    value={search}
                    onChange={(event) => {
                        setSearch(event.currentTarget.value);
                        update('q', event.currentTarget.value);
                    }}
                />
            </Group>

            {resume.length > 0 && (
                <Stack gap="xs">
                    <Title order={4}>Reprendre la lecture</Title>
                    <ScrollArea type="hover" offsetScrollbars>
                        <Group gap="sm" wrap="nowrap" align="flex-start">
                            {resume.map((volume) => (
                                <Box
                                    key={volume.volumeId}
                                    w={RESUME_CARD_WIDTH}
                                    style={{ flexShrink: 0 }}
                                >
                                    <CoverCard
                                        to={`/read/${volume.volumeId}`}
                                        cover={coverUrl(volume.volumeId)}
                                        title={volume.seriesName}
                                        subtitle={volumeLabel(volume)}
                                        progress={
                                            (volume.page + 1) / volume.pageCount
                                        }
                                    />
                                </Box>
                            ))}
                        </Group>
                    </ScrollArea>
                </Stack>
            )}

            <Stack gap="sm">
                <Group justify="space-between" gap="sm">
                    <Chip.Group
                        value={filter}
                        onChange={(value) =>
                            update('filter', value as string, 'all')
                        }
                    >
                        <Group gap={6}>
                            {READING_FILTERS.map((option) => (
                                <Chip
                                    key={option.value}
                                    value={option.value}
                                    size="sm"
                                    variant="light"
                                >
                                    {option.label}
                                </Chip>
                            ))}
                        </Group>
                    </Chip.Group>
                    <Select
                        size="xs"
                        w={150}
                        allowDeselect={false}
                        aria-label="Trier les séries"
                        value={sort}
                        onChange={(value) =>
                            update('sort', value ?? 'name', 'name')
                        }
                        data={SERIES_SORTS}
                    />
                </Group>

                {series.error && (
                    <Alert color="red">{series.error.message}</Alert>
                )}
                {!series.data && !series.error && <Loader mx="auto" />}
                {series.data && visible.length === 0 && (
                    <Text c="dimmed" ta="center" py="xl">
                        {debouncedSearch
                            ? 'Aucune série ne correspond à la recherche.'
                            : filter !== 'all'
                              ? 'Aucune série dans ce filtre.'
                              : 'Bibliothèque vide.'}
                    </Text>
                )}
                <SimpleGrid
                    cols={{ base: 3, xs: 4, sm: 5, md: 6, lg: 7 }}
                    spacing="sm"
                    data-testid="series-grid"
                >
                    {visible.map((item) => {
                        const state = readingStateOf(item);
                        return (
                            <CoverCard
                                key={item.id}
                                to={`/series/${item.id}`}
                                cover={seriesCoverUrl(item)}
                                title={item.name}
                                subtitle={
                                    state === 'started'
                                        ? `${item.readCount} / ${item.volumeCount} lus`
                                        : `${item.volumeCount} tome${item.volumeCount > 1 ? 's' : ''}`
                                }
                                progress={
                                    state === 'started'
                                        ? item.readCount / item.volumeCount
                                        : undefined
                                }
                                corner={
                                    state === 'read' && (
                                        <ThemeIcon
                                            size="sm"
                                            radius="xl"
                                            color="teal"
                                            aria-label="Série lue"
                                        >
                                            <IconCheck size={12} />
                                        </ThemeIcon>
                                    )
                                }
                            />
                        );
                    })}
                </SimpleGrid>
            </Stack>
        </Stack>
    );
};
