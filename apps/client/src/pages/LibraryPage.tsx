import {
    Alert,
    Badge,
    Box,
    Button,
    CloseButton,
    Group,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { IconFilter, IconSearch, IconX } from '@tabler/icons-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';

import { AlphabetIndex } from '@/components/AlphabetIndex';
import { LibraryDisplayMenu } from '@/components/LibraryDisplayMenu';
import { LibraryFiltersDrawer } from '@/components/LibraryFiltersDrawer';
import { PageLoader } from '@/components/PageLoader';
import { PageSection } from '@/components/PageSection';
import { SeriesCard } from '@/components/SeriesCard';
import { SeriesListView } from '@/components/SeriesListView';
import { groupSeries, letterOf } from '@/components/homeGroups';
import { gridColumns, useLibraryDisplay } from '@/components/libraryDisplay';
import {
    type LibraryFilters,
    NO_FILTERS,
    activeFilters,
    filterCount,
    matchesFilters,
    readFilters,
    writeFilters,
} from '@/components/libraryFilters';
import { useScrollMemory } from '@/components/scrollMemory';
import {
    type SeriesSort,
    genresByCount,
    isSeriesSort,
    readingStateOf,
    sortSeries,
} from '@/components/seriesFilters';
import { useDownloads } from '@/offline/downloads';
import { DownloadedVolumes } from '@/pages/DownloadsPage';
import {
    fetchFamilyReaders,
    fetchLibraries,
    fetchSeriesList,
} from '@/services/api';
import { UserContext } from '@/services/auth';
import { useOnline } from '@/services/network';
import { useQuery } from '@/services/useQuery';

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

/**
 * Bibliothèque : tout le catalogue. En haut, la recherche, les filtres (un
 * tiroir) et l'affichage ; les filtres choisis en pastilles. Recherche,
 * filtres et tri sont dans l'adresse : le retour arrière les garde, et
 * l'accueil y mène avec ses « Tout voir ».
 */
export const LibraryPage = () => {
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const query = params.get('q') ?? '';
    const [search, setSearch] = useState(query);
    // Retour arrière : le champ suit l'adresse.
    useEffect(() => setSearch(query), [query]);
    const [debouncedSearch] = useDebouncedValue(query, 250);
    const sortParam = params.get('sort');
    const sort: SeriesSort = isSeriesSort(sortParam) ? sortParam : 'name';
    const filters = readFilters(params);

    const isAdmin = useContext(UserContext)?.role === 'admin';
    const online = useOnline();
    const display = useLibraryDisplay();
    const { downloads } = useDownloads();
    const [filtersOpened, filtersDrawer] = useDisclosure(false);
    // Gardées en mémoire : revenir à la bibliothèque l'affiche tout de suite.
    const libraries = useQuery(fetchLibraries, [], { cacheKey: 'libraries' });
    const readers = useQuery(fetchFamilyReaders, [], {
        cacheKey: 'readers',
    });
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
        { cacheKey: `series:${libraryId}:${debouncedSearch}` },
    );
    // Retour arrière : la page revient où elle était.
    useScrollMemory(!!series.data);

    // Loupe de l'en-tête : le champ de recherche, prêt à taper.
    const searchInput = useRef<HTMLInputElement>(null);
    const focusSearch = (location.state as { focusSearch?: number } | null)
        ?.focusSearch;
    useEffect(() => {
        if (focusSearch) searchInput.current?.focus();
    }, [focusSearch]);

    const setParam = (key: string, value: string, fallback = '') =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                if (value && value !== fallback) next.set(key, value);
                else next.delete(key);
                return next;
            },
            { replace: true },
        );
    const setFilters = (next: LibraryFilters) =>
        setParams((current) => writeFilters(current, next), { replace: true });
    const changeSearch = (text: string) => {
        setSearch(text);
        setParam('q', text);
    };

    // Hors ligne (et rien en mémoire) : les tomes téléchargés.
    if (!online && !series.data) {
        return (
            <Stack>
                <Title order={2}>Sur cet appareil</Title>
                <DownloadedVolumes />
            </Stack>
        );
    }
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

    const all = series.data ?? [];
    const downloaded = new Set(downloads.map((volume) => volume.seriesId));
    const visible = sortSeries(
        all.filter(
            (s) =>
                !(display.hideRead && readingStateOf(s) === 'read') &&
                matchesFilters(s, filters, {
                    readers: readers.data,
                    downloaded,
                }),
        ),
        sort,
    );
    const groups = groupSeries(visible, display.groupBy, {
        readers: readers.data,
    });
    const chips = activeFilters(filters, readers.data);
    const count = filterCount(filters);
    // Index A–Z : trié par nom, sans autre groupement que la lettre ; un
    // repère sur la première série de chaque lettre.
    const byName =
        sort === 'name' &&
        (display.groupBy === 'none' || display.groupBy === 'letter');
    const firstOfLetter = new Map<number, string>();
    if (byName) {
        const seen = new Set<string>();
        for (const s of groups.flatMap((g) => g.list)) {
            const letter = letterOf(s.name);
            if (seen.has(letter)) continue;
            seen.add(letter);
            firstOfLetter.set(s.id, letter);
        }
    }
    const formats = [
        ...new Set(all.map((s) => s.format).filter((f) => f != null)),
    ].sort((a, b) => a.localeCompare(b, 'fr'));

    return (
        <Stack gap="md">
            {libraries.data && libraries.data.length > 1 && (
                <SegmentedControl
                    style={{ alignSelf: 'flex-start' }}
                    value={String(libraryId)}
                    onChange={(value) => setParam('library', value)}
                    data={libraries.data.map((library) => ({
                        value: String(library.id),
                        label: library.name,
                    }))}
                />
            )}

            {/* Toujours visibles en haut, sous l'en-tête. */}
            <Stack
                gap={8}
                py={8}
                data-library-toolbar
                style={{
                    position: 'sticky',
                    top: 'var(--app-shell-header-height, 56px)',
                    zIndex: 10,
                    background: 'var(--mantine-color-body)',
                }}
            >
                <Group gap={8} wrap="nowrap">
                    <TextInput
                        ref={searchInput}
                        style={{ flex: 1, minWidth: 0 }}
                        radius="xl"
                        type="search"
                        placeholder="Série, genre, auteur…"
                        aria-label="Rechercher une série"
                        leftSection={<IconSearch size={16} />}
                        rightSection={
                            search && (
                                <CloseButton
                                    size="sm"
                                    aria-label="Effacer la recherche"
                                    onClick={() => changeSearch('')}
                                />
                            )
                        }
                        value={search}
                        onChange={(event) =>
                            changeSearch(event.currentTarget.value)
                        }
                    />
                    <Button
                        variant={count ? 'light' : 'default'}
                        radius="xl"
                        px={{ base: 10, xs: 14 }}
                        leftSection={<IconFilter size={16} />}
                        rightSection={
                            count > 0 && (
                                <Badge size="sm" circle>
                                    {count}
                                </Badge>
                            )
                        }
                        aria-label="Filtres"
                        onClick={filtersDrawer.open}
                    >
                        <Box component="span" visibleFrom="xs">
                            Filtres
                        </Box>
                    </Button>
                    <LibraryDisplayMenu
                        display={display}
                        sort={sort}
                        onSort={(value) => setParam('sort', value, 'name')}
                    />
                </Group>
                {series.data && (
                    <Group
                        gap={6}
                        wrap="nowrap"
                        style={{ overflowX: 'auto', scrollbarWidth: 'none' }}
                    >
                        <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                            {visible.length} série
                            {visible.length > 1 ? 's' : ''}
                        </Text>
                        {chips.map((chip) => (
                            <Button
                                key={chip.key}
                                size="compact-sm"
                                radius="xl"
                                variant="light"
                                fw={500}
                                rightSection={<IconX size={12} />}
                                aria-label={`Retirer le filtre ${chip.label}`}
                                onClick={() => setFilters(chip.without)}
                                style={{ flexShrink: 0 }}
                            >
                                {chip.label}
                            </Button>
                        ))}
                        {chips.length > 1 && (
                            <Button
                                size="compact-sm"
                                variant="subtle"
                                onClick={() => setFilters(NO_FILTERS)}
                                style={{ flexShrink: 0 }}
                            >
                                Tout effacer
                            </Button>
                        )}
                    </Group>
                )}
            </Stack>

            {series.error && <Alert color="red">{series.error.message}</Alert>}
            {!series.data && !series.error && <PageLoader />}
            {series.data && visible.length === 0 && (
                <Stack align="center" gap="xs" py="xl">
                    <Text c="dimmed" ta="center">
                        {count > 0
                            ? 'Aucune série dans ces filtres.'
                            : debouncedSearch
                              ? 'Aucune série ne correspond à la recherche.'
                              : 'Bibliothèque vide.'}
                    </Text>
                    {count > 0 && (
                        <Button
                            size="xs"
                            variant="subtle"
                            onClick={() => setFilters(NO_FILTERS)}
                        >
                            Effacer les filtres
                        </Button>
                    )}
                </Stack>
            )}
            <Stack
                gap="xl"
                data-testid="series-grid"
                // Place de l'index A–Z, sur le bord droit.
                pr={byName ? { base: 0, sm: 22 } : undefined}
            >
                {groups.map((group) => (
                    <PageSection
                        key={group.key}
                        title={group.title}
                        count={group.list.length}
                    >
                        {display.layout === 'list' ? (
                            <SeriesListView
                                series={group.list}
                                sort={sort}
                                onSort={(value) =>
                                    setParam('sort', value, 'name')
                                }
                                isAdmin={isAdmin}
                                onChanged={series.reload}
                                letterOf={(s) => firstOfLetter.get(s.id)}
                            />
                        ) : (
                            <SimpleGrid
                                cols={gridColumns(display.size)}
                                spacing="sm"
                                data-testid={`${group.key}-grid`}
                            >
                                {group.list.map((item) => (
                                    <div
                                        key={item.id}
                                        data-letter={firstOfLetter.get(item.id)}
                                    >
                                        <SeriesCard
                                            series={item}
                                            isAdmin={isAdmin}
                                            onChanged={series.reload}
                                            coversOnly={display.coversOnly}
                                        />
                                    </div>
                                ))}
                            </SimpleGrid>
                        )}
                    </PageSection>
                ))}
            </Stack>
            {byName && visible.length > 0 && (
                <AlphabetIndex letters={new Set(firstOfLetter.values())} />
            )}

            <LibraryFiltersDrawer
                opened={filtersOpened}
                onClose={filtersDrawer.close}
                filters={filters}
                onChange={setFilters}
                formats={formats}
                genres={genresByCount(all)}
                readers={readers.data ?? []}
                downloads={downloads.length > 0}
                resultCount={visible.length}
            />
        </Stack>
    );
};
