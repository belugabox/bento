import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    CloseButton,
    Group,
    Indicator,
    Loader,
    Menu,
    Popover,
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
import {
    IconAdjustmentsHorizontal,
    IconArrowsSort,
    IconCheck,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
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
    type InProgressVolume,
    type NextVolume,
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
    subtitle = volumeLabel(volume),
    progress,
}: {
    volume: Pick<NextVolume, 'volumeId' | 'seriesName' | 'number' | 'title'>;
    subtitle?: string;
    progress?: number;
}) => (
    <Box w={SHELF_CARD_WIDTH} style={{ flexShrink: 0 }}>
        <CoverCard
            to={`/read/${volume.volumeId}`}
            cover={coverUrl(volume.volumeId, 'small')}
            title={volume.seriesName}
            subtitle={subtitle}
            progress={progress}
        />
    </Box>
);

/**
 * Avancement dans la série d'un tome commencé : tomes lus, plus la part
 * lue du tome en cours.
 */
const seriesProgress = (volume: InProgressVolume) =>
    volume.volumeCount > 0
        ? (volume.readCount + (volume.page + 1) / volume.pageCount) /
          volume.volumeCount
        : 0;

const LIST_LABELS: Record<string, string> = {
    favorite: 'Mes favoris',
    toread: 'À lire',
};

/**
 * Accueil : reprendre la lecture, suite des séries entamées, puis toutes
 * les séries (recherche, filtres et tri).
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

    const update = (changes: Record<string, string>, fallback = '') =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                for (const [key, value] of Object.entries(changes)) {
                    if (value && value !== fallback) next.set(key, value);
                    else next.delete(key);
                }
                return next;
            },
            { replace: true },
        );
    const setSearchText = (value: string) => {
        setSearch(value);
        update({ q: value });
    };

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
    // Filtres du bouton « Filtres », affichés aussi en pastilles.
    const listLabel =
        LIST_LABELS[list] ??
        collections.data?.find((c) => `collection:${c.id}` === list)?.name;
    const active = [
        list !== 'all' && {
            key: 'list',
            label: listLabel ?? 'Collection',
            clear: () => update({ list: '' }),
        },
        !!genre && {
            key: 'genre',
            label: genre,
            clear: () => update({ genre: '' }),
        },
        status !== 'all' && {
            key: 'status',
            label: STATUS_FILTERS.find((s) => s.value === status)?.label ?? '',
            clear: () => update({ status: '' }),
        },
    ].filter((item) => !!item);
    const filtered = filter !== 'all' || active.length > 0;
    // Pendant une recherche : seulement les séries.
    const resume = debouncedSearch ? [] : (inProgress.data ?? []);
    const next = debouncedSearch ? [] : (home.data?.next ?? []);
    const genres = allGenres(series.data ?? []);
    const sortLabel = SERIES_SORTS.find((s) => s.value === sort)?.label;

    return (
        <Stack gap="xl">
            {libraries.data && libraries.data.length > 1 && (
                <SegmentedControl
                    style={{ alignSelf: 'flex-start' }}
                    value={String(libraryId)}
                    onChange={(value) => update({ library: value })}
                    data={libraries.data.map((library) => ({
                        value: String(library.id),
                        label: library.name,
                    }))}
                />
            )}

            {resume.length > 0 && (
                <Shelf title="Reprendre la lecture">
                    {resume.map((volume) => (
                        <ShelfCard
                            key={volume.volumeId}
                            volume={volume}
                            subtitle={`${volumeLabel(volume)} · ${volume.readCount} / ${volume.volumeCount} lus`}
                            progress={seriesProgress(volume)}
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

            <Stack gap="sm">
                <Group justify="space-between" gap="sm">
                    <Group gap="xs" align="baseline">
                        <Title order={4}>Séries</Title>
                        {series.data && (
                            <Text size="sm" c="dimmed">
                                {visible.length}
                            </Text>
                        )}
                    </Group>
                    <Group gap="xs">
                        <TextInput
                            w={{ base: '100%', xs: 240 }}
                            size="xs"
                            radius="xl"
                            placeholder="Rechercher une série"
                            aria-label="Rechercher une série"
                            leftSection={<IconSearch size={14} />}
                            rightSection={
                                search && (
                                    <CloseButton
                                        size="sm"
                                        aria-label="Effacer la recherche"
                                        onClick={() => setSearchText('')}
                                    />
                                )
                            }
                            value={search}
                            onChange={(event) =>
                                setSearchText(event.currentTarget.value)
                            }
                        />
                        <SegmentedControl
                            size="xs"
                            radius="xl"
                            aria-label="État de lecture"
                            value={filter}
                            onChange={(value) =>
                                update({ filter: value }, 'all')
                            }
                            data={READING_FILTERS}
                        />
                        <Popover position="bottom-end" width={260} shadow="md">
                            <Popover.Target>
                                <Indicator
                                    label={active.length}
                                    size={16}
                                    disabled={active.length === 0}
                                    offset={2}
                                >
                                    <Button
                                        size="xs"
                                        radius="xl"
                                        variant={
                                            active.length ? 'light' : 'default'
                                        }
                                        leftSection={
                                            <IconAdjustmentsHorizontal
                                                size={14}
                                            />
                                        }
                                    >
                                        Filtres
                                    </Button>
                                </Indicator>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Stack gap="sm">
                                    <Select
                                        label="Liste"
                                        size="xs"
                                        allowDeselect={false}
                                        value={list}
                                        onChange={(value) =>
                                            update({ list: value ?? '' }, 'all')
                                        }
                                        comboboxProps={{ withinPortal: false }}
                                        data={[
                                            {
                                                value: 'all',
                                                label: 'Toutes les séries',
                                            },
                                            {
                                                value: 'favorite',
                                                label: 'Mes favoris',
                                            },
                                            {
                                                value: 'toread',
                                                label: 'À lire',
                                            },
                                            ...(collections.data ?? []).map(
                                                (c) => ({
                                                    value: `collection:${c.id}`,
                                                    label: c.name,
                                                }),
                                            ),
                                        ]}
                                    />
                                    <Select
                                        label="Genre"
                                        size="xs"
                                        clearable
                                        searchable
                                        disabled={genres.length === 0}
                                        placeholder="Tous les genres"
                                        value={genre}
                                        onChange={(value) =>
                                            update({ genre: value ?? '' })
                                        }
                                        comboboxProps={{ withinPortal: false }}
                                        data={genres}
                                    />
                                    <Select
                                        label="Statut"
                                        size="xs"
                                        allowDeselect={false}
                                        value={status}
                                        onChange={(value) =>
                                            update(
                                                { status: value ?? '' },
                                                'all',
                                            )
                                        }
                                        comboboxProps={{ withinPortal: false }}
                                        data={STATUS_FILTERS}
                                    />
                                    <Button
                                        size="xs"
                                        variant="subtle"
                                        disabled={active.length === 0}
                                        onClick={() =>
                                            update({
                                                list: '',
                                                genre: '',
                                                status: '',
                                            })
                                        }
                                    >
                                        Effacer les filtres
                                    </Button>
                                </Stack>
                            </Popover.Dropdown>
                        </Popover>
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <Button
                                    size="xs"
                                    radius="xl"
                                    variant="default"
                                    aria-label="Trier les séries"
                                    leftSection={<IconArrowsSort size={14} />}
                                >
                                    {sortLabel}
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {SERIES_SORTS.map((option) => (
                                    <Menu.Item
                                        key={option.value}
                                        rightSection={
                                            option.value === sort && (
                                                <IconCheck size={14} />
                                            )
                                        }
                                        onClick={() =>
                                            update(
                                                { sort: option.value },
                                                'name',
                                            )
                                        }
                                    >
                                        {option.label}
                                    </Menu.Item>
                                ))}
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Group>

                {active.length > 0 && (
                    <Group gap={6}>
                        {active.map((item) => (
                            <Badge
                                key={item.key}
                                variant="light"
                                size="lg"
                                radius="xl"
                                tt="none"
                                fw={500}
                                rightSection={
                                    <ActionIcon
                                        size="xs"
                                        radius="xl"
                                        variant="transparent"
                                        aria-label={`Retirer le filtre ${item.label}`}
                                        onClick={item.clear}
                                    >
                                        <IconX size={12} />
                                    </ActionIcon>
                                }
                            >
                                {item.label}
                            </Badge>
                        ))}
                    </Group>
                )}

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
                                cover={seriesCoverUrl(item, 'small')}
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
