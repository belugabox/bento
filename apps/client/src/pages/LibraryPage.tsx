import {
    Alert,
    Box,
    Button,
    Group,
    Indicator,
    Loader,
    Menu,
    ScrollArea,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
    Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowsSort,
    IconBook2,
    IconCheck,
    IconChevronDown,
} from '@tabler/icons-react';
import { type ReactNode, useContext } from 'react';
import { useSearchParams } from 'react-router';

import { SeriesCardMenu, VolumeCardMenu } from '@/components/CardMenus';
import { CoverCard } from '@/components/CoverCard';
import { volumeLabel, volumeShortLabel } from '@/components/readingStatus';
import {
    READING_FILTERS,
    type ReadingFilter,
    SERIES_SORTS,
    STATUS_FILTERS,
    type SeriesSort,
    type StatusFilter,
    filterSeries,
    genresByCount,
    readingStateOf,
} from '@/components/seriesFilters';
import {
    type InProgressVolume,
    coverUrl,
    fetchInProgress,
    fetchLibraries,
    fetchSeriesList,
    seriesCoverUrl,
} from '@/services/api';
import { UserContext } from '@/services/auth';
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
    onChanged,
}: {
    volume: Pick<
        InProgressVolume,
        | 'volumeId'
        | 'version'
        | 'seriesId'
        | 'seriesName'
        | 'number'
        | 'title'
        | 'page'
    >;
    subtitle?: string;
    progress?: number;
    /** Après une action du menu (recharger l'accueil). */
    onChanged: () => void;
}) => (
    <Box w={SHELF_CARD_WIDTH} style={{ flexShrink: 0 }}>
        <CoverCard
            to={`/read/${volume.volumeId}`}
            cover={coverUrl(volume.volumeId, volume.version, 'small')}
            title={volume.seriesName}
            subtitle={subtitle}
            progress={progress}
            menu={<VolumeCardMenu volume={volume} onChanged={onChanged} />}
        />
    </Box>
);

/**
 * Avancement dans la série : tomes lus, plus la part lue du tome en cours
 * (rien pour un tome pas encore ouvert).
 */
const seriesProgress = (volume: InProgressVolume) =>
    volume.volumeCount > 0
        ? (volume.readCount +
              (volume.page === null
                  ? 0
                  : (volume.page + 1) / volume.pageCount)) /
          volume.volumeCount
        : 0;

/** Genres montrés en pastilles ; les autres sont dans « Plus ». */
const GENRE_CHIPS = 5;

/** Pastille d'un filtre : un clic la choisit, un autre la retire. */
const FilterChip = ({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
}) => (
    <Button
        size="compact-sm"
        radius="xl"
        fw={500}
        variant={active ? 'filled' : 'default'}
        aria-pressed={active}
        onClick={onClick}
        style={{ flexShrink: 0 }}
    >
        {children}
    </Button>
);

/** Rangée de pastilles, qui défile au doigt sans retour à la ligne. */
const ChipRow = ({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) => (
    <ScrollArea type="never" aria-label={label}>
        <Group gap={6} wrap="nowrap">
            {children}
        </Group>
    </ScrollArea>
);

/**
 * Accueil : reprendre la lecture (tomes en cours et suite des séries
 * entamées), puis toutes les séries (filtres et tri). La recherche est dans
 * l'en-tête, qui la met dans l'adresse (`q`).
 */
export const LibraryPage = () => {
    // Bibliothèque, recherche, filtre et tri dans l'adresse : le retour
    // arrière les garde.
    const [params, setParams] = useSearchParams();
    const [debouncedSearch] = useDebouncedValue(params.get('q') ?? '', 250);
    const filter = (params.get('filter') as ReadingFilter | null) ?? 'all';
    const sort = (params.get('sort') as SeriesSort | null) ?? 'name';
    const genre = params.get('genre');
    const status = (params.get('status') as StatusFilter | null) ?? 'all';

    const isAdmin = useContext(UserContext)?.role === 'admin';
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

    /** Après une action d'un menu ⋮ : reprises et séries à jour. */
    const reloadHome = () => {
        inProgress.reload();
        series.reload();
    };
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
        genre,
        status,
    });
    const filtered = filter !== 'all' || !!genre || status !== 'all';
    // Pendant une recherche : seulement les séries.
    const resume = debouncedSearch ? [] : (inProgress.data ?? []);
    // Pastilles : les genres les plus fréquents, et celui choisi.
    const genres = genresByCount(series.data ?? []);
    const shownGenres = genres.slice(0, GENRE_CHIPS).map((g) => g.name);
    if (genre && !shownGenres.includes(genre)) shownGenres.unshift(genre);
    // Les autres, par ordre alphabétique, avec leur nombre de séries.
    const moreGenres = genres
        .filter((g) => !shownGenres.includes(g.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const sortLabel = SERIES_SORTS.find((s) => s.value === sort)?.label;
    const readingLabel = READING_FILTERS.find((f) => f.value === filter)?.label;

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
                            // Court : tient sur une ligne de la carte.
                            subtitle={`${volumeShortLabel(volume)} · ${volume.readCount}/${volume.volumeCount} lus`}
                            progress={seriesProgress(volume)}
                            onChanged={reloadHome}
                        />
                    ))}
                </Shelf>
            )}

            <Stack gap="sm">
                <Group gap="xs" align="baseline">
                    <Title order={4}>Séries</Title>
                    {series.data && (
                        <Text size="sm" c="dimmed">
                            {visible.length}
                        </Text>
                    )}
                </Group>

                {/* Reste visible sous l'en-tête pendant le défilement. */}
                <Stack
                    gap={6}
                    py={6}
                    style={{
                        position: 'sticky',
                        top: 'var(--app-shell-header-offset, 56px)',
                        zIndex: 10,
                        background: 'var(--mantine-color-body)',
                    }}
                >
                    <Group gap={6} wrap="nowrap">
                        <Menu position="bottom-start">
                            <Menu.Target>
                                <Button
                                    size="compact-sm"
                                    radius="xl"
                                    fw={500}
                                    variant={
                                        filter === 'all' ? 'default' : 'light'
                                    }
                                    aria-label="État de lecture"
                                    leftSection={<IconBook2 size={14} />}
                                    rightSection={<IconChevronDown size={12} />}
                                    style={{ flexShrink: 0 }}
                                >
                                    {filter === 'all'
                                        ? 'Lecture'
                                        : readingLabel}
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {READING_FILTERS.map((option) => (
                                    <Menu.Item
                                        key={option.value}
                                        rightSection={
                                            option.value === filter && (
                                                <IconCheck size={14} />
                                            )
                                        }
                                        onClick={() =>
                                            update(
                                                { filter: option.value },
                                                'all',
                                            )
                                        }
                                    >
                                        {option.label}
                                    </Menu.Item>
                                ))}
                            </Menu.Dropdown>
                        </Menu>
                        <Menu position="bottom-start">
                            <Menu.Target>
                                <Indicator
                                    size={8}
                                    offset={4}
                                    disabled={status === 'all'}
                                >
                                    <Button
                                        size="compact-sm"
                                        radius="xl"
                                        fw={500}
                                        variant="default"
                                        aria-label="Trier les séries"
                                        leftSection={
                                            <IconArrowsSort size={14} />
                                        }
                                        style={{ flexShrink: 0 }}
                                    >
                                        {sortLabel}
                                    </Button>
                                </Indicator>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Label>Trier par</Menu.Label>
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
                                <Menu.Divider />
                                <Menu.Label>Parution</Menu.Label>
                                {STATUS_FILTERS.map((option) => (
                                    <Menu.Item
                                        key={option.value}
                                        rightSection={
                                            option.value === status && (
                                                <IconCheck size={14} />
                                            )
                                        }
                                        onClick={() =>
                                            update(
                                                { status: option.value },
                                                'all',
                                            )
                                        }
                                    >
                                        {option.label}
                                    </Menu.Item>
                                ))}
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                    {genres.length > 0 && (
                        <ChipRow label="Genres">
                            {shownGenres.map((name) => (
                                <FilterChip
                                    key={name}
                                    active={genre === name}
                                    onClick={() =>
                                        update({
                                            genre: genre === name ? '' : name,
                                        })
                                    }
                                >
                                    {name}
                                </FilterChip>
                            ))}
                            {moreGenres.length > 0 && (
                                <Menu position="bottom-end">
                                    <Menu.Target>
                                        <Button
                                            size="compact-sm"
                                            radius="xl"
                                            fw={500}
                                            variant="subtle"
                                            rightSection={
                                                <IconChevronDown size={12} />
                                            }
                                            style={{ flexShrink: 0 }}
                                        >
                                            Plus
                                        </Button>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        <ScrollArea.Autosize mah={320}>
                                            {moreGenres.map(
                                                ({ name, count }) => (
                                                    <Menu.Item
                                                        key={name}
                                                        rightSection={
                                                            <Text
                                                                size="xs"
                                                                c="dimmed"
                                                            >
                                                                {count}
                                                            </Text>
                                                        }
                                                        onClick={() =>
                                                            update({
                                                                genre: name,
                                                            })
                                                        }
                                                    >
                                                        {name}
                                                    </Menu.Item>
                                                ),
                                            )}
                                        </ScrollArea.Autosize>
                                    </Menu.Dropdown>
                                </Menu>
                            )}
                        </ChipRow>
                    )}
                </Stack>

                {series.error && (
                    <Alert color="red">{series.error.message}</Alert>
                )}
                {!series.data && !series.error && <Loader mx="auto" />}
                {series.data && visible.length === 0 && (
                    <Stack align="center" gap="xs" py="xl">
                        <Text c="dimmed" ta="center">
                            {debouncedSearch
                                ? 'Aucune série ne correspond à la recherche.'
                                : filtered
                                  ? 'Aucune série dans ce filtre.'
                                  : 'Bibliothèque vide.'}
                        </Text>
                        {filtered && (
                            <Button
                                size="xs"
                                variant="subtle"
                                onClick={() =>
                                    update({
                                        filter: '',
                                        genre: '',
                                        status: '',
                                    })
                                }
                            >
                                Effacer les filtres
                            </Button>
                        )}
                    </Stack>
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
                                menu={
                                    <SeriesCardMenu
                                        series={item}
                                        isAdmin={isAdmin}
                                        onChanged={reloadHome}
                                    />
                                }
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
