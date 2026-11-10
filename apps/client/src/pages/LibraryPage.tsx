import {
    Alert,
    Box,
    Button,
    Center,
    Container,
    Divider,
    Group,
    Indicator,
    Loader,
    type MantineBreakpoint,
    Menu,
    ScrollArea,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
    VisuallyHidden,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowsSort,
    IconBookmarkFilled,
    IconCheck,
    IconChevronDown,
    IconLayoutGrid,
    IconList,
    IconPlayerPlayFilled,
} from '@tabler/icons-react';
import { type ReactNode, useContext, useEffect } from 'react';
import { useSearchParams } from 'react-router';

import { SeriesCardMenu, VolumeCardMenu } from '@/components/CardMenus';
import { CoverCard } from '@/components/CoverCard';
import { ReadByFilter } from '@/components/ReadByFilter';
import {
    LIST_COLUMNS,
    type LibraryDisplay,
    type LibraryLayout,
    gridColumns,
    useLibraryDisplay,
} from '@/components/libraryDisplay';
import {
    seriesVolumesLabel,
    volumeLabel,
    volumeShortLabel,
} from '@/components/readingStatus';
import {
    SERIES_SORTS,
    STATUS_FILTERS,
    type SeriesSort,
    type StatusFilter,
    filterSeries,
    genresByCount,
    readingStateOf,
    seriesDetails,
} from '@/components/seriesFilters';
import {
    type InProgressVolume,
    coverUrl,
    fetchFamilyReaders,
    fetchInProgress,
    fetchLibraries,
    fetchSeriesList,
    seriesCoverUrl,
} from '@/services/api';
import { UserContext } from '@/services/auth';
import { useQuery } from '@/services/useQuery';

/** Tome à reprendre : ouvre le lecteur. */
const ResumeCard = ({
    volume,
    subtitle = volumeLabel(volume),
    progress,
    onChanged,
    display,
    details,
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
    display: LibraryDisplay;
    /** Infos de la série, en mode liste. */
    details?: string[];
}) => (
    <CoverCard
        to={`/read/${volume.volumeId}`}
        cover={coverUrl(volume.volumeId, volume.version, 'small')}
        title={volume.seriesName}
        subtitle={subtitle}
        progress={progress}
        menu={<VolumeCardMenu volume={volume} onChanged={onChanged} />}
        layout={display.layout === 'list' ? 'row' : 'card'}
        coversOnly={display.coversOnly}
        details={details}
        // ▶ en couleur : la carte ouvre le lecteur, pas la fiche.
        badge={
            <ThemeIcon size="sm" radius="xl" aria-label="Tome à reprendre">
                <IconPlayerPlayFilled size={10} />
            </ThemeIcon>
        }
    />
);

/** Icône grise d'une série : lue, ou dans la liste « à lire ». */
const seriesBadge = (state: string, toRead: boolean) =>
    state === 'read' ? (
        <ThemeIcon size="sm" radius="xl" color="gray" aria-label="Série lue">
            <IconCheck size={12} />
        </ThemeIcon>
    ) : toRead ? (
        <ThemeIcon size="sm" radius="xl" color="gray" aria-label="À lire">
            <IconBookmarkFilled size={11} />
        </ThemeIcon>
    ) : undefined;

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

// Dernière bibliothèque ouverte, gardée sur l'appareil.
const LIBRARY_KEY = 'bento:library';

const rememberedLibrary = () => {
    try {
        return Number(localStorage.getItem(LIBRARY_KEY)) || undefined;
    } catch {
        return undefined;
    }
};

const rememberLibrary = (id: number) => {
    try {
        localStorage.setItem(LIBRARY_KEY, String(id));
    } catch {
        // Stockage refusé : la première bibliothèque, comme avant.
    }
};

/** Genres montrés en pastilles ; les autres sont dans « Plus ». */
const GENRE_CHIPS = 3;

/** Bloc de l'accueil, sous un titre très discret (petites capitales). */
const HomeSection = ({
    title,
    count,
    children,
}: {
    title: string;
    count: number;
    children: ReactNode;
}) => (
    <Stack gap={8} component="section" aria-label={title}>
        <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            style={{ letterSpacing: '0.08em' }}
        >
            {title} · {count}
        </Text>
        {children}
    </Stack>
);

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
        size="compact-md"
        radius="xl"
        fw={400}
        fz="sm"
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
    visibleFrom,
    children,
}: {
    label: string;
    visibleFrom?: MantineBreakpoint;
    children: ReactNode;
}) => (
    <Box
        visibleFrom={visibleFrom}
        aria-label={label}
        role="group"
        style={{
            display: 'flex',
            gap: 6,
            // Sa largeur, ou ce qui reste : défile au-delà.
            flex: '0 1 auto',
            minWidth: 0,
            overflowX: 'auto',
            scrollbarWidth: 'none',
        }}
    >
        {children}
    </Box>
);

/**
 * Accueil : la grille en trois blocs, chacun sous un titre discret :
 * les tomes à reprendre (tomes en cours et suite des séries entamées), les
 * séries pas lues (« à lire » d'abord), puis les séries terminées ;
 * les filtres sont en bas de l'écran. La recherche est dans l'en-tête, qui
 * la met dans l'adresse (`q`).
 */
export const LibraryPage = () => {
    // Bibliothèque, recherche, filtre et tri dans l'adresse : le retour
    // arrière les garde.
    const [params, setParams] = useSearchParams();
    const [debouncedSearch] = useDebouncedValue(params.get('q') ?? '', 250);
    const sort = (params.get('sort') as SeriesSort | null) ?? 'name';
    const genre = params.get('genre');
    const status = (params.get('status') as StatusFilter | null) ?? 'all';
    // « Lu par » : une personne de la famille (son numéro de compte).
    const readBy = Number(params.get('readBy')) || null;

    const isAdmin = useContext(UserContext)?.role === 'admin';
    const display = useLibraryDisplay();
    const libraries = useQuery(fetchLibraries, []);
    const inProgress = useQuery(fetchInProgress, []);
    const readers = useQuery(fetchFamilyReaders, []);
    // Bibliothèque : celle de l'adresse, sinon la dernière ouverte sur
    // l'appareil (les séries se chargent sans attendre la liste des
    // bibliothèques), sinon la première.
    const remembered = rememberedLibrary();
    const libraryId =
        Number(params.get('library')) ||
        (libraries.data
            ? libraries.data.some((l) => l.id === remembered)
                ? remembered
                : libraries.data[0]?.id
            : remembered) ||
        undefined;
    useEffect(() => {
        if (libraries.data && libraryId) rememberLibrary(libraryId);
    }, [libraries.data, libraryId]);
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

    // Séries lues par la personne choisie (inconnue : filtre ignoré).
    const readBySeries = new Set(
        readers.data?.find((r) => r.id === readBy)?.seriesIds,
    );
    const readByActive = readBy !== null && readers.data !== undefined;
    const visible = filterSeries(
        (series.data ?? []).filter(
            (s) =>
                (!readByActive || readBySeries.has(s.id)) &&
                !(display.hideRead && readingStateOf(s) === 'read'),
        ),
        { sort, genre, status },
    );
    const filtered = !!genre || status !== 'all' || readByActive;
    // Tomes à reprendre en tête, si leur série passe les filtres et la
    // recherche ; puis les autres séries.
    const visibleIds = new Set(visible.map((s) => s.id));
    const resume = (inProgress.data ?? []).filter((v) =>
        visibleIds.has(v.seriesId),
    );
    const resumed = new Set(resume.map((v) => v.seriesId));
    const others = visible.filter((s) => !resumed.has(s.id));
    // Trois blocs, séparés par un espace : en cours, pas lues, terminées.
    const unread = others.filter((s) => readingStateOf(s) !== 'read');
    const done = others.filter((s) => readingStateOf(s) === 'read');
    const cols =
        display.layout === 'list' ? LIST_COLUMNS : gridColumns(display.size);
    // Pastilles : les genres les plus fréquents, et celui choisi.
    const genres = genresByCount(series.data ?? []);
    const shownGenres = genres.slice(0, GENRE_CHIPS).map((g) => g.name);
    if (genre && !shownGenres.includes(genre)) shownGenres.unshift(genre);
    // Les autres, par ordre alphabétique, avec leur nombre de séries.
    const moreGenres = genres
        .filter((g) => !shownGenres.includes(g.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const sortLabel = SERIES_SORTS.find((s) => s.value === sort)?.label;

    return (
        // Marge du bas : la dernière rangée passe au-dessus des filtres.
        <Stack gap="xl" pb={88}>
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

            <Stack gap="sm">
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
                                        genre: '',
                                        status: '',
                                        readBy: '',
                                    })
                                }
                            >
                                Effacer les filtres
                            </Button>
                        )}
                    </Stack>
                )}
                <Stack gap="xl" data-testid="series-grid">
                    {resume.length > 0 && (
                        <HomeSection title="En cours" count={resume.length}>
                            <SimpleGrid
                                cols={cols}
                                spacing="sm"
                                data-testid="resume-grid"
                            >
                                {resume.map((volume) => (
                                    <ResumeCard
                                        key={volume.volumeId}
                                        volume={volume}
                                        // Court : tient sur une ligne de la carte.
                                        subtitle={`${volumeShortLabel(volume)} · ${volume.readCount}/${volume.volumeCount} lus`}
                                        progress={seriesProgress(volume)}
                                        onChanged={reloadHome}
                                        display={display}
                                        details={
                                            display.layout === 'list'
                                                ? seriesDetails(
                                                      visible.find(
                                                          (s) =>
                                                              s.id ===
                                                              volume.seriesId,
                                                      )!,
                                                  )
                                                : undefined
                                        }
                                    />
                                ))}
                            </SimpleGrid>
                        </HomeSection>
                    )}
                    {[
                        { key: 'unread', title: 'À découvrir', list: unread },
                        { key: 'read', title: 'Déjà lues', list: done },
                    ]
                        .filter((group) => group.list.length > 0)
                        .map((group) => (
                            <HomeSection
                                key={group.key}
                                title={group.title}
                                count={group.list.length}
                            >
                                <SimpleGrid
                                    cols={cols}
                                    spacing="sm"
                                    data-testid={`${group.key}-grid`}
                                >
                                    {group.list.map((item) => {
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
                                                cover={seriesCoverUrl(
                                                    item,
                                                    'small',
                                                )}
                                                title={item.name}
                                                subtitle={
                                                    state === 'started'
                                                        ? `${item.readCount} / ${item.volumeCount} lus`
                                                        : seriesVolumesLabel(
                                                              item.volumeCount,
                                                              item.volumeKinds,
                                                          )
                                                }
                                                progress={
                                                    state === 'started'
                                                        ? item.readCount /
                                                          item.volumeCount
                                                        : undefined
                                                }
                                                badge={seriesBadge(
                                                    state,
                                                    !!item.toRead,
                                                )}
                                                layout={
                                                    display.layout === 'list'
                                                        ? 'row'
                                                        : 'card'
                                                }
                                                coversOnly={display.coversOnly}
                                                details={
                                                    display.layout === 'list'
                                                        ? seriesDetails(item)
                                                        : undefined
                                                }
                                            />
                                        );
                                    })}
                                </SimpleGrid>
                            </HomeSection>
                        ))}
                </Stack>
            </Stack>

            {/* Filtres : toujours visibles en bas de l'écran. */}
            <Box
                style={{
                    position: 'fixed',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 100,
                    background: 'var(--mantine-color-body)',
                    borderTop: '1px solid var(--mantine-color-default-border)',
                    paddingBottom: 'env(safe-area-inset-bottom)',
                }}
            >
                <Container size="xl">
                    {/* Centrée ; seuls les genres rétrécissent (et défilent). */}
                    <Group
                        gap="lg"
                        py={12}
                        wrap="nowrap"
                        justify="center"
                        preventGrowOverflow={false}
                    >
                        <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                            {/* Même réglage que dans « Thème et affichage… ». */}
                            <SegmentedControl
                                size="sm"
                                radius="xl"
                                aria-label="Affichage"
                                value={display.layout}
                                onChange={(layout) =>
                                    display.set({
                                        layout: layout as LibraryLayout,
                                    })
                                }
                                data={[
                                    {
                                        value: 'grid',
                                        label: (
                                            <Center>
                                                <IconLayoutGrid size={16} />
                                                <VisuallyHidden>
                                                    Grille
                                                </VisuallyHidden>
                                            </Center>
                                        ),
                                    },
                                    {
                                        value: 'list',
                                        label: (
                                            <Center>
                                                <IconList size={16} />
                                                <VisuallyHidden>
                                                    Liste
                                                </VisuallyHidden>
                                            </Center>
                                        ),
                                    },
                                ]}
                            />
                            <Menu position="top-start">
                                <Menu.Target>
                                    <Indicator
                                        size={8}
                                        offset={4}
                                        disabled={
                                            status === 'all' &&
                                            !display.hideRead
                                        }
                                    >
                                        <Button
                                            size="compact-md"
                                            radius="xl"
                                            fw={400}
                                            fz="sm"
                                            variant="default"
                                            aria-label="Trier les séries"
                                            leftSection={
                                                <IconArrowsSort size={16} />
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
                                    <Menu.Label>Séries lues</Menu.Label>
                                    {[
                                        { hide: false, label: 'Afficher' },
                                        { hide: true, label: 'Masquer' },
                                    ].map((option) => (
                                        <Menu.Item
                                            key={option.label}
                                            rightSection={
                                                option.hide ===
                                                    display.hideRead && (
                                                    <IconCheck size={14} />
                                                )
                                            }
                                            onClick={() =>
                                                display.set({
                                                    hideRead: option.hide,
                                                })
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
                            {readers.data && readers.data.length > 0 && (
                                <ReadByFilter
                                    readers={readers.data}
                                    value={readBy}
                                    onChange={(id) =>
                                        update({ readBy: id ? String(id) : '' })
                                    }
                                />
                            )}
                        </Group>
                        {genres.length > 0 && (
                            <Divider orientation="vertical" />
                        )}
                        {genres.length > 0 && (
                            <ChipRow label="Genres" visibleFrom="sm">
                                {shownGenres.map((name) => (
                                    <FilterChip
                                        key={name}
                                        active={genre === name}
                                        onClick={() =>
                                            update({
                                                genre:
                                                    genre === name ? '' : name,
                                            })
                                        }
                                    >
                                        {name}
                                    </FilterChip>
                                ))}
                                {moreGenres.length > 0 && (
                                    <Menu position="top-end">
                                        <Menu.Target>
                                            <Button
                                                size="compact-md"
                                                radius="xl"
                                                fw={400}
                                                fz="sm"
                                                variant="subtle"
                                                rightSection={
                                                    <IconChevronDown
                                                        size={12}
                                                    />
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
                        {/* Écran étroit : un seul bouton pour tous les genres. */}
                        {genres.length > 0 && (
                            <Menu position="top-end">
                                <Menu.Target>
                                    <Button
                                        hiddenFrom="sm"
                                        size="compact-md"
                                        radius="xl"
                                        fw={400}
                                        fz="sm"
                                        variant={genre ? 'filled' : 'default'}
                                        aria-label="Choisir un genre"
                                        rightSection={
                                            <IconChevronDown size={12} />
                                        }
                                        style={{ flexShrink: 1, minWidth: 0 }}
                                    >
                                        {genre ?? 'Genre'}
                                    </Button>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <ScrollArea.Autosize mah={320}>
                                        <Menu.Item
                                            rightSection={
                                                !genre && (
                                                    <IconCheck size={14} />
                                                )
                                            }
                                            onClick={() =>
                                                update({ genre: '' })
                                            }
                                        >
                                            Tous les genres
                                        </Menu.Item>
                                        {genres.map(({ name, count }) => (
                                            <Menu.Item
                                                key={name}
                                                rightSection={
                                                    name === genre ? (
                                                        <IconCheck size={14} />
                                                    ) : (
                                                        <Text
                                                            size="xs"
                                                            c="dimmed"
                                                        >
                                                            {count}
                                                        </Text>
                                                    )
                                                }
                                                onClick={() =>
                                                    update({ genre: name })
                                                }
                                            >
                                                {name}
                                            </Menu.Item>
                                        ))}
                                    </ScrollArea.Autosize>
                                </Menu.Dropdown>
                            </Menu>
                        )}
                    </Group>
                </Container>
            </Box>
        </Stack>
    );
};
