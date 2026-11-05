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
import { type ReactNode, useState } from 'react';
import { useSearchParams } from 'react-router';

import { CoverCard } from '@/components/CoverCard';
import { volumeLabel } from '@/components/readingStatus';
import {
    type ListFilter,
    READING_FILTERS,
    type ReadingFilter,
    SERIES_SORTS,
    STATUS_FILTERS,
    type SeriesSort,
    type StatusFilter,
    allGenres,
    filterSeries,
    readingStateOf,
} from '@/components/seriesFilters';
import {
    type HomeVolume,
    coverUrl,
    fetchCollections,
    fetchHome,
    fetchInProgress,
    fetchLibraries,
    fetchSeriesList,
    seriesCoverUrl,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

// Largeur des vignettes des rangées (défilement horizontal).
const SHELF_CARD_WIDTH = 132;

/** Rangée de tomes, qui défile horizontalement. */
const Shelf = ({ title, children }: { title: string; children: ReactNode }) => (
    <Stack gap="xs">
        <Title order={4}>{title}</Title>
        <ScrollArea type="hover" offsetScrollbars>
            <Group gap="sm" wrap="nowrap" align="flex-start">
                {children}
            </Group>
        </ScrollArea>
    </Stack>
);

const ShelfCard = ({
    volume,
    progress,
}: {
    volume: Pick<HomeVolume, 'volumeId' | 'seriesName' | 'number' | 'title'>;
    progress?: number;
}) => (
    <Box w={SHELF_CARD_WIDTH} style={{ flexShrink: 0 }}>
        <CoverCard
            to={`/read/${volume.volumeId}`}
            cover={coverUrl(volume.volumeId)}
            title={volume.seriesName}
            subtitle={volumeLabel(volume)}
            progress={progress}
        />
    </Box>
);

/**
 * Accueil : reprendre la lecture, suite des séries entamées, nouveautés,
 * puis toutes les séries.
 */
export const LibraryPage = () => {
    // Bibliothèque, recherche, filtre et tri dans l'adresse : le retour
    // arrière les garde.
    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState(params.get('q') ?? '');
    const [debouncedSearch] = useDebouncedValue(search, 250);
    const filter = (params.get('filter') as ReadingFilter | null) ?? 'all';
    const sort = (params.get('sort') as SeriesSort | null) ?? 'name';
    const list = (params.get('list') as ListFilter | null) ?? 'all';
    const genre = params.get('genre');
    const status = (params.get('status') as StatusFilter | null) ?? 'all';

    const libraries = useQuery(fetchLibraries, []);
    const inProgress = useQuery(fetchInProgress, []);
    const home = useQuery(fetchHome, []);
    const collections = useQuery(fetchCollections, []);
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

    const visible = filterSeries(series.data ?? [], {
        filter,
        sort,
        list,
        genre,
        status,
    });
    const filtered =
        filter !== 'all' || list !== 'all' || !!genre || status !== 'all';
    // Pendant une recherche : seulement les séries.
    const resume = debouncedSearch ? [] : (inProgress.data ?? []);
    const next = debouncedSearch ? [] : (home.data?.next ?? []);
    const recent = debouncedSearch ? [] : (home.data?.recent ?? []);
    const genres = allGenres(series.data ?? []);

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
                <Shelf title="Reprendre la lecture">
                    {resume.map((volume) => (
                        <ShelfCard
                            key={volume.volumeId}
                            volume={volume}
                            progress={(volume.page + 1) / volume.pageCount}
                        />
                    ))}
                </Shelf>
            )}
            {next.length > 0 && (
                <Shelf title="La suite de tes séries">
                    {next.map((volume) => (
                        <ShelfCard key={volume.volumeId} volume={volume} />
                    ))}
                </Shelf>
            )}
            {recent.length > 0 && (
                <Shelf title="Nouveautés">
                    {recent.map((volume) => (
                        <ShelfCard key={volume.volumeId} volume={volume} />
                    ))}
                </Shelf>
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
                    <Group gap="xs">
                        <Select
                            size="xs"
                            w={170}
                            allowDeselect={false}
                            aria-label="Liste"
                            value={list}
                            onChange={(value) =>
                                update('list', value ?? 'all', 'all')
                            }
                            data={[
                                { value: 'all', label: 'Toutes les séries' },
                                { value: 'favorite', label: 'Mes favoris' },
                                { value: 'toread', label: 'À lire' },
                                ...(collections.data ?? []).map((c) => ({
                                    value: `collection:${c.id}`,
                                    label: c.name,
                                })),
                            ]}
                        />
                        {genres.length > 0 && (
                            <Select
                                size="xs"
                                w={150}
                                clearable
                                searchable
                                placeholder="Tous les genres"
                                aria-label="Genre"
                                value={genre}
                                onChange={(value) =>
                                    update('genre', value ?? '')
                                }
                                data={genres}
                            />
                        )}
                        <Select
                            size="xs"
                            w={170}
                            allowDeselect={false}
                            aria-label="Statut"
                            value={status}
                            onChange={(value) =>
                                update('status', value ?? 'all', 'all')
                            }
                            data={STATUS_FILTERS}
                        />
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
                </Group>

                {series.error && (
                    <Alert color="red">{series.error.message}</Alert>
                )}
                {!series.data && !series.error && <Loader mx="auto" />}
                {series.data && visible.length === 0 && (
                    <Text c="dimmed" ta="center" py="xl">
                        {debouncedSearch
                            ? 'Aucune série ne correspond à la recherche.'
                            : filtered
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
