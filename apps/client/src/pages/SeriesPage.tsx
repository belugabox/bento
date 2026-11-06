import {
    ActionIcon,
    Alert,
    Anchor,
    Badge,
    Button,
    Flex,
    Group,
    Image,
    Loader,
    Menu,
    SimpleGrid,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowLeft,
    IconBookmark,
    IconBookmarkFilled,
    IconCheck,
    IconChecks,
    IconDots,
    IconFolders,
    IconPencil,
    IconPlayerPlay,
    IconRestore,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { AUDIENCE_LABELS, FORMAT_LABELS } from '@server/types';

import { CollectionsModal } from '@/components/CollectionsModal';
import { CoverCard } from '@/components/CoverCard';
import { ageRatingLabel } from '@/components/ageLimits';
import {
    nextToRead,
    progressRatio,
    volumeLabel,
    volumeTitleOf,
} from '@/components/readingStatus';
import {
    coverUrl,
    fetchSeries,
    markSeriesRead,
    saveProgress,
    seriesCoverUrl,
    setSeriesLists,
} from '@/services/api';
import { useCurrentUser } from '@/services/auth';
import { useQuery } from '@/services/useQuery';

const ACTION_LABELS = {
    start: 'Lire',
    resume: 'Continuer',
    reread: 'Relire',
};

/** Fiche d'une série : informations, tomes et où en est la personne. */
export const SeriesPage = () => {
    const seriesId = Number(useParams().id);
    const isAdmin = useCurrentUser().role === 'admin';
    const {
        data: series,
        error,
        reload,
    } = useQuery(() => fetchSeries(seriesId), [seriesId]);
    const [collectionsOpened, collectionsModal] = useDisclosure(false);
    // Liste en cours d'enregistrement (bouton désactivé).
    const [savingList, setSavingList] = useState(false);

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!series) return <Loader mx="auto" />;

    const first = series.volumes[0];
    const next = nextToRead(series.volumes);
    const readCount = series.volumes.filter(
        (v) => v.progress?.completed,
    ).length;
    // Titre de chaque tome sous son numéro, si l'un d'eux en a un.
    const withTitles = series.volumes.some((v) => volumeTitleOf(v));
    const audience = series.audience ?? series.defaultAudience;
    const details = [
        // « Manga · Shonen » : format et public d'abord.
        FORMAT_LABELS[series.format ?? series.defaultFormat],
        audience && AUDIENCE_LABELS[audience],
        series.year && String(series.year),
        series.writer,
        series.publisher,
    ].filter(Boolean);

    /** Toute la série lue, ou non lue (la progression est alors effacée). */
    const markAll = async (read: boolean) => {
        if (
            !read &&
            !window.confirm(
                'Marquer toute la série comme non lue ? La progression de chaque tome sera effacée.',
            )
        ) {
            return;
        }
        await markSeriesRead(series.id, read);
        reload();
    };

    /** Ajoute ou retire la série de la liste « à lire ». */
    const toggleToRead = async () => {
        setSavingList(true);
        try {
            await setSeriesLists(series.id, { toRead: !series.toRead });
            reload();
        } finally {
            setSavingList(false);
        }
    };

    /** Coche « lu » d'un tome (sans ouvrir le lecteur). */
    const toggleRead = async (volume: (typeof series.volumes)[number]) => {
        await saveProgress(volume.id, {
            completed: !volume.progress?.completed,
        });
        reload();
    };

    return (
        <Stack>
            <Anchor component={Link} to="/" size="sm">
                <Group gap={4}>
                    <IconArrowLeft size={14} /> {series.library.name}
                </Group>
            </Anchor>

            <Flex gap="lg" direction={{ base: 'column', xs: 'row' }}>
                {first && (
                    <Image
                        src={seriesCoverUrl({
                            ...series,
                            coverVolumeId: first.id,
                            coverVolumeVersion: first.version,
                        })}
                        alt={series.name}
                        w={{ base: 160, sm: 200 }}
                        h={{ base: 240, sm: 300 }}
                        fit="cover"
                        radius="md"
                        style={{ flexShrink: 0, alignSelf: 'flex-start' }}
                    />
                )}
                <Stack gap="xs">
                    <Title order={2}>{series.name}</Title>
                    {details.length > 0 && (
                        <Text c="dimmed" size="sm">
                            {details.join(' · ')}
                        </Text>
                    )}
                    <Group gap="xs">
                        <Badge variant="light">
                            {series.volumes.length} tome
                            {series.volumes.length > 1 ? 's' : ''}
                        </Badge>
                        {series.status && (
                            <Badge
                                variant="light"
                                color={
                                    series.status === 'completed'
                                        ? 'grape'
                                        : 'blue'
                                }
                            >
                                {series.status === 'completed'
                                    ? 'Série terminée'
                                    : 'En cours de parution'}
                            </Badge>
                        )}
                        {readCount > 0 && (
                            <Badge variant="light">
                                {readCount} lu{readCount > 1 ? 's' : ''}
                            </Badge>
                        )}
                        {series.genres.map((genre) => (
                            <Badge key={genre} variant="light" color="gray">
                                {genre}
                            </Badge>
                        ))}
                        {ageRatingLabel(series.ageRating) && (
                            <Badge variant="light" color="orange">
                                {ageRatingLabel(series.ageRating)}
                            </Badge>
                        )}
                    </Group>
                    {series.themes.length > 0 && (
                        <Text size="xs" c="dimmed">
                            Thèmes : {series.themes.join(', ')}
                        </Text>
                    )}
                    {isAdmin && (
                        <Button
                            component={Link}
                            to={`/series/${series.id}/edit`}
                            variant="default"
                            size="xs"
                            w="fit-content"
                            leftSection={<IconPencil size={14} />}
                        >
                            Modifier les métadonnées
                        </Button>
                    )}
                    {series.summary && (
                        <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                            {series.summary}
                        </Text>
                    )}
                    <Group gap="xs">
                        {next && (
                            <Button
                                component={Link}
                                // Relire : repartir de la première page.
                                to={`/read/${next.volume.id}${next.action === 'reread' ? '?page=1' : ''}`}
                                leftSection={<IconPlayerPlay size={16} />}
                                w="fit-content"
                            >
                                {ACTION_LABELS[next.action]}{' '}
                                {volumeLabel(next.volume).toLowerCase()}
                            </Button>
                        )}
                        <Tooltip
                            label={
                                series.toRead
                                    ? 'Retirer de « À lire »'
                                    : 'Ajouter à « À lire »'
                            }
                        >
                            <ActionIcon
                                variant={series.toRead ? 'light' : 'default'}
                                size="lg"
                                aria-label="À lire"
                                aria-pressed={series.toRead}
                                loading={savingList}
                                onClick={() => void toggleToRead()}
                            >
                                {series.toRead ? (
                                    <IconBookmarkFilled size={18} />
                                ) : (
                                    <IconBookmark size={18} />
                                )}
                            </ActionIcon>
                        </Tooltip>
                        <Menu position="bottom-start">
                            <Menu.Target>
                                <ActionIcon
                                    variant="default"
                                    size="lg"
                                    aria-label="Lecture de la série"
                                >
                                    <IconDots size={18} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    leftSection={<IconChecks size={14} />}
                                    disabled={
                                        readCount === series.volumes.length
                                    }
                                    onClick={() => void markAll(true)}
                                >
                                    Marquer toute la série comme lue
                                </Menu.Item>
                                <Menu.Item
                                    leftSection={<IconRestore size={14} />}
                                    disabled={
                                        !series.volumes.some((v) => v.progress)
                                    }
                                    onClick={() => void markAll(false)}
                                >
                                    Marquer toute la série comme non lue
                                </Menu.Item>
                                {isAdmin && (
                                    <Menu.Item
                                        leftSection={<IconFolders size={14} />}
                                        onClick={collectionsModal.open}
                                    >
                                        Collections…
                                    </Menu.Item>
                                )}
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Stack>
            </Flex>

            {isAdmin && (
                <CollectionsModal
                    opened={collectionsOpened}
                    onClose={collectionsModal.close}
                    seriesId={series.id}
                    collectionIds={series.collectionIds}
                    onChanged={reload}
                />
            )}

            <SimpleGrid cols={{ base: 3, xs: 4, sm: 5, md: 6, lg: 8 }}>
                {series.volumes.map((volume) => {
                    const read = volume.progress?.completed ?? false;
                    return (
                        <CoverCard
                            key={volume.id}
                            to={`/read/${volume.id}`}
                            cover={coverUrl(volume.id, volume.version, 'small')}
                            title={volumeLabel(volume)}
                            caption={
                                withTitles
                                    ? (volumeTitleOf(volume) ?? '')
                                    : undefined
                            }
                            subtitle={
                                volume.progress && !read
                                    ? `Page ${volume.progress.page + 1} / ${volume.pageCount}`
                                    : `${volume.pageCount} pages`
                            }
                            progress={read ? undefined : progressRatio(volume)}
                            corner={
                                <Tooltip
                                    label={
                                        read
                                            ? 'Marquer comme non lu'
                                            : 'Marquer comme lu'
                                    }
                                >
                                    <ActionIcon
                                        radius="xl"
                                        size="sm"
                                        variant={read ? 'filled' : 'default'}
                                        style={{ opacity: read ? 1 : 0.8 }}
                                        aria-label={
                                            read
                                                ? `${volumeLabel(volume)} lu`
                                                : `Marquer ${volumeLabel(volume)} comme lu`
                                        }
                                        onClick={() => void toggleRead(volume)}
                                    >
                                        <IconCheck size={14} />
                                    </ActionIcon>
                                </Tooltip>
                            }
                        />
                    );
                })}
            </SimpleGrid>
        </Stack>
    );
};
