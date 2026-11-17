import {
    Alert,
    AspectRatio,
    Avatar,
    Box,
    Button,
    Center,
    Group,
    Image,
    Paper,
    Progress,
    SimpleGrid,
    Stack,
    Text,
    Title,
    useMatches,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
    IconBook,
    IconChevronRight,
    IconPlayerPlayFilled,
} from '@tabler/icons-react';
import { useContext } from 'react';
import { Link } from 'react-router';

import { VolumeCardMenu } from '@/components/CardMenus';
import { PageLoader } from '@/components/PageLoader';
import { PageSection } from '@/components/PageSection';
import { SuggestionRow } from '@/components/SuggestionRow';
import { UserAvatar } from '@/components/accounts/UserAvatar';
import { ratingLabel, reviewsLabel } from '@/components/format';
import { homeBlocks } from '@/components/homeBlocks';
import { gridColumns, useLibraryDisplay } from '@/components/libraryDisplay';
import { libraryLink } from '@/components/libraryFilters';
import { volumeLabel, volumeShortLabel } from '@/components/readingStatus';
import { useScrollMemory } from '@/components/scrollMemory';
import { newBadge } from '@/components/seriesCardParts';
import { sortSeries } from '@/components/seriesFilters';
import { DownloadedVolumes } from '@/pages/DownloadsPage';
import {
    type FamilyReader,
    type InProgressVolume,
    type SeriesSummary,
    coverUrl,
    fetchFamilyReaders,
    fetchInProgress,
    fetchSeriesList,
    fetchSuggestionGems,
    seriesCoverUrl,
} from '@/services/api';
import { UserContext } from '@/services/auth';
import { useOnline } from '@/services/network';
import { useQuery } from '@/services/useQuery';

/** Part lue d'un tome (rien pour un tome pas encore ouvert). */
const volumeProgress = (volume: InProgressVolume) =>
    volume.page === null || !volume.pageCount
        ? 0
        : Math.min(1, (volume.page + 1) / volume.pageCount);

/** « Tome 5 · page 45 / 190 », ou « Tome 6 · à commencer ». */
const resumeLabel = (volume: InProgressVolume) =>
    `${volumeLabel(volume)} · ${
        volume.page === null
            ? 'à commencer'
            : `page ${volume.page + 1} / ${volume.pageCount}`
    }`;

/** Couverture d'un tome, au format d'un livre. */
const VolumeCover = ({ volume }: { volume: InProgressVolume }) => (
    <AspectRatio ratio={2 / 3}>
        <Image
            src={coverUrl(volume.volumeId, volume.version, 'small')}
            alt=""
            radius="sm"
            fit="cover"
        />
    </AspectRatio>
);

// Espace entre deux cartes des blocs (`spacing="sm"` de leur grille).
const CARD_GAP = 12;

/** Grande carte du dernier tome en cours : « Continuer ». */
const ResumeHero = ({
    volume,
    onChanged,
    coverWidth,
}: {
    volume: InProgressVolume;
    onChanged: () => void;
    /** Largeur d'une carte des autres blocs ; inconnue : une taille fixe. */
    coverWidth?: number;
}) => (
    <Paper withBorder radius="md" p={{ base: 'sm', sm: 'md' }}>
        <Group wrap="nowrap" align="center" gap="md">
            <Box
                component={Link}
                to={`/read/${volume.volumeId}`}
                // La taille des couvertures des autres blocs (demandé).
                w={coverWidth ?? { base: 120, xs: 140, sm: 170 }}
                style={{ flexShrink: 0 }}
                aria-label={`Lire ${volume.seriesName}`}
            >
                <VolumeCover volume={volume} />
            </Box>
            <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                <Text
                    size="xs"
                    c="dimmed"
                    fw={600}
                    tt="uppercase"
                    style={{ letterSpacing: '0.08em' }}
                >
                    Reprendre
                </Text>
                <Group gap={8} wrap="nowrap">
                    <Text
                        fw={700}
                        fz={{ base: 'lg', sm: 'xl' }}
                        lh={1.2}
                        lineClamp={2}
                    >
                        {volume.seriesName}
                    </Text>
                    {newBadge(volume.newCount)}
                </Group>
                <Text size="sm" c="dimmed">
                    {resumeLabel(volume)}
                </Text>
                {volume.page !== null && (
                    <Progress
                        size="sm"
                        maw={320}
                        value={volumeProgress(volume) * 100}
                        aria-label="Avancement du tome"
                    />
                )}
                <Group gap={6} mt={4}>
                    <Button
                        component={Link}
                        to={`/read/${volume.volumeId}`}
                        leftSection={<IconPlayerPlayFilled size={14} />}
                    >
                        {volume.page === null ? 'Commencer' : 'Continuer'}
                    </Button>
                    <VolumeCardMenu volume={volume} onChanged={onChanged} />
                </Group>
            </Stack>
        </Group>
    </Paper>
);

/** Autre tome en cours : une petite ligne qui ouvre le lecteur. */
const ResumeLine = ({ volume }: { volume: InProgressVolume }) => (
    <Paper
        withBorder
        radius="md"
        p={8}
        component={Link}
        to={`/read/${volume.volumeId}`}
        style={{ color: 'inherit', textDecoration: 'none' }}
    >
        <Group gap="sm" wrap="nowrap">
            <Box w={40} style={{ flexShrink: 0 }}>
                <VolumeCover volume={volume} />
            </Box>
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={500} truncate>
                        {volume.seriesName}
                    </Text>
                    {newBadge(volume.newCount)}
                </Group>
                <Text size="xs" c="dimmed" truncate>
                    {volumeShortLabel(volume)} ·{' '}
                    {volume.page === null
                        ? 'à commencer'
                        : `${Math.round(volumeProgress(volume) * 100)} %`}
                </Text>
                {volume.page !== null && (
                    <Progress
                        size="xs"
                        value={volumeProgress(volume) * 100}
                        aria-label="Avancement du tome"
                    />
                )}
            </Stack>
        </Group>
    </Paper>
);

/**
 * Vers toute la bibliothèque, en bas de l'accueil : un éventail des
 * couvertures des derniers ajouts, le nombre de séries et de tomes.
 */
const LibraryLink = ({ series }: { series: SeriesSummary[] }) => {
    const covers = sortSeries(series, 'recent')
        .map((s) => seriesCoverUrl(s, 'small'))
        .filter((cover) => cover !== null)
        .slice(0, 3);
    const volumes = series.reduce((sum, s) => sum + s.volumeCount, 0);
    return (
        <Paper
            withBorder
            radius="md"
            p="md"
            component={Link}
            to="/library"
            aria-label="Toute la bibliothèque"
            style={{ color: 'inherit', textDecoration: 'none' }}
        >
            <Group wrap="nowrap" gap="lg">
                {/* Les couvertures se chevauchent, la plus récente devant. */}
                <Box
                    pos="relative"
                    h={72}
                    w={48 + 22 * Math.max(covers.length - 1, 0)}
                    style={{ flexShrink: 0 }}
                >
                    {covers.map((cover, index) => (
                        <Image
                            key={cover}
                            src={cover}
                            alt=""
                            w={48}
                            h={72}
                            fit="cover"
                            radius="sm"
                            pos="absolute"
                            top={0}
                            left={22 * (covers.length - 1 - index)}
                            style={{
                                zIndex: covers.length - index,
                                transform: `rotate(${(covers.length - 1 - index) * 4}deg)`,
                                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)',
                            }}
                        />
                    ))}
                </Box>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={600}>Toute la bibliothèque</Text>
                    <Text size="sm" c="dimmed">
                        {series.length} série{series.length > 1 ? 's' : ''} ·{' '}
                        {volumes} tome{volumes > 1 ? 's' : ''}
                    </Text>
                </div>
                <IconChevronRight size={18} />
            </Group>
        </Paper>
    );
};

/** « Lu par Lou », « Lu par Lou et Tom », « Lu par Lou, Tom et Léa ». */
const readByLabel = (names: string[]) =>
    `Lu par ${
        names.length > 1
            ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`
            : names[0]
    }`;

/** Avatars de ceux qui l'ont lue, en haut à gauche de la couverture. */
const ReadersTag = ({ readers }: { readers: FamilyReader[] }) => (
    <Avatar.Group spacing={8}>
        {readers.slice(0, 3).map((reader) => (
            <UserAvatar
                key={reader.id}
                name={reader.name}
                seed={reader.avatarSeed}
                size={24}
                radius="xl"
                style={{ border: '2px solid var(--mantine-color-body)' }}
            />
        ))}
    </Avatar.Group>
);

/**
 * Accueil : ce qui concerne la personne. Le tome à reprendre en grand (les
 * autres à côté), puis des blocs d'une ligne : nouveaux tomes, liste « à
 * lire », « Pour toi », séries lues par la famille, bien notées jamais
 * ouvertes, ajouts récents. « Tout voir » ouvre
 * la bibliothèque déjà filtrée. Un bloc vide n'apparaît pas.
 */
export const HomePage = () => {
    const isAdmin = useContext(UserContext)?.role === 'admin';
    // Largeur d'une carte des blocs : celle de la page, partagée entre les
    // cartes d'une ligne et leurs espaces (comme leur grille).
    const display = useLibraryDisplay();
    const perRow = useMatches(gridColumns(display.size));
    const { ref: page, width } = useElementSize();
    const coverWidth = width
        ? // Moins la bordure de la carte, de chaque côté de sa couverture.
          (width - (perRow - 1) * CARD_GAP) / perRow - 2
        : undefined;
    const online = useOnline();
    // Gardées en mémoire : revenir à l'accueil l'affiche tout de suite.
    const inProgress = useQuery(fetchInProgress, [], {
        cacheKey: 'continue',
    });
    const series = useQuery(() => fetchSeriesList(), [], {
        cacheKey: 'series:all',
    });
    const readers = useQuery(fetchFamilyReaders, [], {
        cacheKey: 'readers',
    });
    // Bien notées, jamais ouvertes : le bloc vient quand elles arrivent.
    const gems = useQuery(fetchSuggestionGems, [], { cacheKey: 'gems' });
    useScrollMemory(!!series.data && !!inProgress.data);

    const reload = () => {
        inProgress.reload();
        series.reload();
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
    const error = series.error ?? inProgress.error;
    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!series.data || !inProgress.data) return <PageLoader />;

    const resume = inProgress.data;
    const [first, ...others] = resume;
    const blocks = homeBlocks(series.data, resume, readers.data ?? [], {
        gems: gems.data,
    });
    const readersOf = (s: SeriesSummary) =>
        (readers.data ?? []).filter((r) => r.seriesIds.includes(s.id));
    const gemOf = new Map((gems.data ?? []).map((g) => [g.id, g]));
    const row = { isAdmin, onChanged: reload };

    if (series.data.length === 0 && resume.length === 0) {
        return (
            <Center py="xl">
                <Stack align="center" gap={6}>
                    <IconBook size={32} />
                    <Text c="dimmed">Bibliothèque vide.</Text>
                </Stack>
            </Center>
        );
    }

    return (
        <Stack gap="xl" ref={page}>
            {first && (
                <PageSection
                    title="En cours"
                    count={resume.length}
                    more={libraryLink(
                        { reading: ['started'] },
                        { sort: 'lastRead' },
                    )}
                >
                    <SimpleGrid
                        cols={{ base: 1, md: others.length ? 2 : 1 }}
                        spacing="sm"
                        data-testid="resume"
                    >
                        <ResumeHero
                            volume={first}
                            onChanged={reload}
                            coverWidth={coverWidth}
                        />
                        {others.length > 0 && (
                            <SimpleGrid
                                cols={{ base: 1, xs: 2 }}
                                spacing={8}
                                style={{ alignContent: 'start' }}
                            >
                                {others.slice(0, 6).map((volume) => (
                                    <ResumeLine
                                        key={volume.volumeId}
                                        volume={volume}
                                    />
                                ))}
                            </SimpleGrid>
                        )}
                    </SimpleGrid>
                </PageSection>
            )}
            <SuggestionRow
                {...row}
                title="Nouveaux tomes"
                count={blocks.fresh.length}
                more={libraryLink({ reading: ['new'] })}
                items={blocks.fresh.map((s) => ({
                    series: s,
                    reason: `+${s.newCount} · ${s.readCount} / ${s.volumeCount} lus`,
                }))}
            />
            <SuggestionRow
                {...row}
                title="À lire"
                count={blocks.toRead.length}
                more={libraryLink({ reading: ['toread'] })}
                items={blocks.toRead.map((s) => ({ series: s }))}
            />
            <SuggestionRow
                {...row}
                title="Pour toi"
                items={blocks.forYou.map((s) => ({
                    series: s,
                    reason: blocks.reasons.get(s.id),
                }))}
            />
            <SuggestionRow
                {...row}
                title="Lu par la famille"
                count={blocks.family.length}
                more={libraryLink({
                    reading: ['unread'],
                    readers: (readers.data ?? []).map((r) => r.id),
                })}
                items={blocks.family.map((s) => ({
                    series: s,
                    reason: readByLabel(readersOf(s).map((r) => r.name)),
                }))}
                tag={(s) => <ReadersTag readers={readersOf(s)} />}
            />
            <SuggestionRow
                {...row}
                title="Bien notées, jamais ouvertes"
                count={blocks.gems.length}
                more={libraryLink({ reading: ['unread'] }, { sort: 'rating' })}
                items={blocks.gems.map((s) => {
                    const gem = gemOf.get(s.id)!;
                    return {
                        series: s,
                        reason: `${ratingLabel(gem.rating)} · ${reviewsLabel(gem.reviews)}`,
                    };
                })}
            />
            <SuggestionRow
                {...row}
                title="Récemment ajoutées"
                more={libraryLink({}, { sort: 'recent' })}
                items={blocks.recent.map((s) => ({ series: s }))}
            />
            <LibraryLink series={series.data} />
        </Stack>
    );
};
