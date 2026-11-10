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
    ThemeIcon,
    Title,
    Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconArrowLeft,
    IconBookmark,
    IconBookmarkFilled,
    IconCheck,
    IconChecks,
    IconDots,
    IconDownload,
    IconPencil,
    IconPlayerPlay,
    IconRestore,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { isMainKind, isStandalone } from '@server/types';

import { SeriesVolumeMenu } from '@/components/CardMenus';
import { CompletenessBadge } from '@/components/CompletenessBadge';
import { CoverCard } from '@/components/CoverCard';
import { DownloadRing } from '@/components/DownloadIndicator';
import { SeriesReaders } from '@/components/SeriesReaders';
import { ageLabel, seriesAgeOf } from '@/components/ageLimits';
import { completenessOf } from '@/components/completeness';
import { gridColumns, useLibraryDisplay } from '@/components/libraryDisplay';
import {
    countedVolumes,
    nextToRead,
    progressRatio,
    volumeCountLabel,
    volumeLabel,
    volumeTitleOf,
} from '@/components/readingStatus';
import { NEXT_VOLUME_COUNTS, nextVolumesLabel } from '@/offline/auto';
import { queueDownloads, useDownloads } from '@/offline/downloads';
import {
    coverUrl,
    fetchSeries,
    markSeriesRead,
    saveProgress,
    seriesCoverUrl,
    setSeriesLists,
} from '@/services/api';
import { useCurrentUser, useReadOnly } from '@/services/auth';
import { useQuery } from '@/services/useQuery';

const ACTION_LABELS = {
    start: 'Lire',
    resume: 'Continuer',
    reread: 'Relire',
};

/** Fiche d'une série : informations, tomes et où en est la personne. */
// Titre des sections de la fiche, sous les tomes.
// La série (tomes, one-shots, intégrales) d'abord, sans titre.
const KIND_SECTIONS = [
    { key: 'main', title: null },
    { key: 'hors-serie', title: 'Hors-séries' },
    { key: 'special', title: 'Spéciaux' },
] as const;

export const SeriesPage = () => {
    const seriesId = Number(useParams().id);
    const user = useCurrentUser();
    const isAdmin = user.role === 'admin';
    const { downloads, jobs } = useDownloads();
    const readOnly = useReadOnly();
    const { size } = useLibraryDisplay();
    const {
        data: series,
        error,
        reload,
    } = useQuery(() => fetchSeries(seriesId), [seriesId]);
    // Liste en cours d'enregistrement (bouton désactivé).
    const [savingList, setSavingList] = useState(false);

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!series) return <Loader mx="auto" />;

    const first = series.volumes[0];
    const next = nextToRead(series.volumes);
    // « N lus » : comme sur la carte, sans hors-séries ni spéciaux.
    const readCount = countedVolumes(series.volumes).filter(
        (v) => v.progress?.completed,
    ).length;
    const allRead = series.volumes.every((v) => v.progress?.completed);
    // Titre de chaque tome sous son numéro, si l'un d'eux en a un.
    const withTitles = series.volumes.some((v) => volumeTitleOf(v));
    const age = seriesAgeOf(series);
    const details = [
        series.format,
        series.year && String(series.year),
        series.writer,
        series.publisher,
    ].filter(Boolean);
    // Fiche incomplète : montrée à l'admin seulement (ComicInfo des tomes).
    const completeness = isAdmin
        ? completenessOf({
              name: series.name,
              hasFormat: !!series.formatId,
              hasAge: age !== null,
              hasStatus: !!series.status,
              genreCount: series.genres.length,
              writer: series.writer,
              penciller: first?.admin?.comicInfo.Penciller,
              publisher: series.publisher,
              summary: series.summary,
              volumes: series.volumes.map((v) => ({
                  number: v.number,
                  year: v.admin?.comicInfo.Year,
              })),
          })
        : undefined;

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

    // Tomes à télécharger : la série (sans hors-séries ni spéciaux), à
    // partir du tome à lire, pas encore lus ni téléchargés.
    const downloadedIds = new Set(downloads.map((d) => d.id));
    const main = series.volumes.filter((v) => isMainKind(v.kind));
    const from = next ? Math.max(main.indexOf(next.volume), 0) : 0;
    const toDownload = main
        .slice(from)
        .filter((v) => !v.progress?.completed && !downloadedIds.has(v.id));

    /** Télécharge les `count` tomes suivants sur l'appareil. */
    const downloadNext = (count: number) => {
        const added = queueDownloads(
            toDownload.slice(0, count).map((v) => ({
                id: v.id,
                label: `${series.name}, ${volumeLabel(v).toLowerCase()}`,
            })),
            user.id,
        );
        notifications.show({
            message: added
                ? `${added} tome${added > 1 ? 's' : ''} en téléchargement (voir « Téléchargements »).`
                : 'Ces tomes sont déjà téléchargés.',
        });
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
                <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                    <Title order={2}>{series.name}</Title>
                    {details.length > 0 && (
                        <Text c="dimmed" size="sm">
                            {details.join(' · ')}
                        </Text>
                    )}
                    <Group gap="xs">
                        <Badge variant="light">
                            {volumeCountLabel(series.volumes)}
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
                        {age !== null && (
                            <Badge variant="light" color="orange">
                                {ageLabel(age)}
                            </Badge>
                        )}
                    </Group>
                    {series.themes.length > 0 && (
                        <Text size="xs" c="dimmed">
                            Thèmes : {series.themes.join(', ')}
                        </Text>
                    )}
                    {completeness && completeness.percent < 100 && (
                        <div>
                            <CompletenessBadge
                                completeness={completeness}
                                action={
                                    <Button
                                        component={Link}
                                        to={`/series/${series.id}/edit`}
                                        size="xs"
                                        variant="light"
                                    >
                                        Compléter la fiche
                                    </Button>
                                }
                            />
                        </div>
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
                    {/* Boutons de lecture, et « Lu par » à droite. */}
                    <Group justify="space-between" gap="xs">
                        <Group gap="xs">
                            {next && (
                                <Button
                                    component={Link}
                                    // Relire : repartir de la première page.
                                    to={`/read/${next.volume.id}${next.action === 'reread' ? '?page=1' : ''}`}
                                    leftSection={<IconPlayerPlay size={16} />}
                                    w="fit-content"
                                >
                                    {ACTION_LABELS[next.action]}
                                    {/* One-shot : « Lire » seul. */}
                                    {!isStandalone(next.volume) &&
                                        ` ${volumeLabel(next.volume).toLowerCase()}`}
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
                                    variant={
                                        series.toRead ? 'light' : 'default'
                                    }
                                    size="lg"
                                    aria-label="À lire"
                                    aria-pressed={series.toRead}
                                    disabled={readOnly}
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
                                        disabled={readOnly}
                                    >
                                        <IconDots size={18} />
                                    </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        leftSection={<IconChecks size={14} />}
                                        disabled={allRead}
                                        onClick={() => void markAll(true)}
                                    >
                                        Marquer toute la série comme lue
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={<IconRestore size={14} />}
                                        disabled={
                                            !series.volumes.some(
                                                (v) => v.progress,
                                            )
                                        }
                                        onClick={() => void markAll(false)}
                                    >
                                        Marquer toute la série comme non lue
                                    </Menu.Item>
                                    <Menu.Divider />
                                    <Menu.Label>Télécharger</Menu.Label>
                                    {[
                                        ...NEXT_VOLUME_COUNTS.map((count) => ({
                                            count,
                                            label: nextVolumesLabel(count),
                                        })),
                                        {
                                            count: Infinity,
                                            label: 'Tous les tomes pas lus',
                                        },
                                    ].map((option) => (
                                        <Menu.Item
                                            key={option.label}
                                            leftSection={
                                                <IconDownload size={14} />
                                            }
                                            disabled={toDownload.length === 0}
                                            onClick={() =>
                                                downloadNext(option.count)
                                            }
                                        >
                                            {option.label}
                                        </Menu.Item>
                                    ))}
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                        <SeriesReaders seriesId={series.id} />
                    </Group>
                </Stack>
            </Flex>

            {KIND_SECTIONS.map(({ key, title }) => {
                const group = series.volumes.filter((v) =>
                    key === 'main' ? isMainKind(v.kind) : v.kind === key,
                );
                if (group.length === 0) return null;
                // Un one-shot seul : pas de tome à montrer (« Lire » suffit).
                if (
                    key === 'main' &&
                    group.length === 1 &&
                    isStandalone(group[0]!)
                ) {
                    return null;
                }
                return (
                    <Stack key={key} gap="xs">
                        {title && <Title order={4}>{title}</Title>}
                        <SimpleGrid cols={gridColumns(size)}>
                            {group.map((volume, index) => {
                                const read =
                                    volume.progress?.completed ?? false;
                                const downloaded = downloadedIds.has(volume.id);
                                const job = jobs.find(
                                    (j) =>
                                        j.volumeId === volume.id &&
                                        j.state !== 'failed',
                                );
                                return (
                                    <CoverCard
                                        key={volume.id}
                                        to={`/read/${volume.id}`}
                                        cover={coverUrl(
                                            volume.id,
                                            volume.version,
                                            'small',
                                        )}
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
                                        progress={
                                            read
                                                ? undefined
                                                : progressRatio(volume)
                                        }
                                        menu={
                                            <SeriesVolumeMenu
                                                volume={volume}
                                                series={series}
                                                // Tomes seulement : « jusqu'à »
                                                // suit l'ordre des tomes.
                                                upTo={
                                                    key === 'main' && index > 0
                                                }
                                                isAdmin={isAdmin}
                                                onChanged={reload}
                                            />
                                        }
                                        // Gardé sur l'appareil (lecture sans réseau).
                                        tag={
                                            // En téléchargement : son avancement.
                                            job ? (
                                                <DownloadRing
                                                    ratio={
                                                        job.total
                                                            ? job.done /
                                                              job.total
                                                            : 0
                                                    }
                                                />
                                            ) : downloaded ? (
                                                <ThemeIcon
                                                    size="sm"
                                                    radius="xl"
                                                    color="gray"
                                                    aria-label="Téléchargé"
                                                >
                                                    <IconDownload size={12} />
                                                </ThemeIcon>
                                            ) : undefined
                                        }
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
                                                    variant={
                                                        read
                                                            ? 'filled'
                                                            : 'default'
                                                    }
                                                    style={{
                                                        opacity: read ? 1 : 0.8,
                                                    }}
                                                    aria-label={
                                                        read
                                                            ? `${volumeLabel(volume)} lu`
                                                            : `Marquer ${volumeLabel(volume)} comme lu`
                                                    }
                                                    disabled={readOnly}
                                                    onClick={() =>
                                                        void toggleRead(volume)
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
            })}
        </Stack>
    );
};
