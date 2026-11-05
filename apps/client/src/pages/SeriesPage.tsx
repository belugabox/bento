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
    SimpleGrid,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconCheck,
    IconPencil,
    IconPlayerPlay,
} from '@tabler/icons-react';
import type { MouseEvent } from 'react';
import { Link, useParams } from 'react-router';

import { CoverCard } from '@/components/CoverCard';
import { ageRatingLabel } from '@/components/ageLimits';
import {
    nextToRead,
    progressRatio,
    volumeLabel,
} from '@/components/readingStatus';
import {
    coverUrl,
    fetchSeries,
    saveProgress,
    seriesCoverUrl,
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

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!series) return <Loader mx="auto" />;

    const first = series.volumes[0];
    const next = nextToRead(series.volumes);
    const readCount = series.volumes.filter(
        (v) => v.progress?.completed,
    ).length;
    const details = [
        series.year && String(series.year),
        series.writer,
        series.publisher,
    ].filter(Boolean);

    /** Coche « lu » d'un tome (sans ouvrir le lecteur). */
    const toggleRead = async (
        event: MouseEvent,
        volume: (typeof series.volumes)[number],
    ) => {
        // La vignette est un lien : ne pas le suivre.
        event.preventDefault();
        event.stopPropagation();
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
                        })}
                        alt={series.name}
                        w={{ base: 160, sm: 200 }}
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
                            <Badge variant="light" color="teal">
                                {readCount} lu{readCount > 1 ? 's' : ''}
                            </Badge>
                        )}
                        {series.genre && (
                            <Badge variant="light" color="gray">
                                {series.genre}
                            </Badge>
                        )}
                        {ageRatingLabel(series.ageRating) && (
                            <Badge variant="light" color="orange">
                                {ageRatingLabel(series.ageRating)}
                            </Badge>
                        )}
                    </Group>
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
                </Stack>
            </Flex>

            <SimpleGrid cols={{ base: 3, xs: 4, sm: 5, md: 6, lg: 8 }}>
                {series.volumes.map((volume) => {
                    const read = volume.progress?.completed ?? false;
                    return (
                        <CoverCard
                            key={volume.id}
                            to={`/read/${volume.id}`}
                            cover={coverUrl(volume.id)}
                            title={volumeLabel(volume)}
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
                                        color="teal"
                                        style={{ opacity: read ? 1 : 0.8 }}
                                        aria-label={
                                            read
                                                ? `${volumeLabel(volume)} lu`
                                                : `Marquer ${volumeLabel(volume)} comme lu`
                                        }
                                        onClick={(event) =>
                                            void toggleRead(event, volume)
                                        }
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
