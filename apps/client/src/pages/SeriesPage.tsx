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
import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router';

import {
    SOURCE_LABELS,
    isMainKind,
    isStandalone,
    sourceUrl,
} from '@server/types';

import { SeriesVolumeMenu } from '@/components/CardMenus';
import { CompletenessBadge } from '@/components/CompletenessBadge';
import { CoverCard } from '@/components/CoverCard';
import { DownloadRing } from '@/components/DownloadIndicator';
import { SeriesReaders } from '@/components/SeriesReaders';
import { ageLabel, seriesAgeOf } from '@/components/ageLimits';
import { completenessOf, fieldsFromVolumes } from '@/components/completeness';
import { ratingLabel } from '@/components/format';
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
import { NetworkError } from '@/services/network';
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

    // Sans réseau : la fiche n'est pas sur l'appareil, ses tomes
    // téléchargés si.
    if (error instanceof NetworkError) {
        return (
            <Alert color="gray" title="Pas de réseau">
                Cette fiche n’est pas disponible hors ligne.{' '}
                <Anchor component={Link} to="/">
                    Voir les tomes de l’appareil
                </Anchor>
            </Alert>
        );
    }
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
              // Lus dans les tomes, comme l'éditeur : même pourcentage.
              ...fieldsFromVolumes(
                  series.volumes.map((v) => v.admin?.comicInfo ?? {}),
              ),
              hasFormat: !!series.formatId,
              hasAge: age !== null,
              hasStatus: !!series.status,
              genreCount: series.genres.length,
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
                    {/* Modifier (admin) : un crayon discret à côté du nom. */}
                    <Group gap={6} wrap="nowrap" align="center">
                        <Title order={2}>{series.name}</Title>
                        {isAdmin && (
                            <Tooltip label="Modifier les métadonnées">
                                <ActionIcon
                                    component={Link}
                                    to={`/series/${series.id}/edit`}
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                    aria-label="Modifier les métadonnées"
                                >
                                    <IconPencil size={16} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                    {details.length > 0 && (
                        <Text c="dimmed" size="sm">
                            {details.join(' · ')}
                        </Text>
                    )}
                    <Group gap="xs">
                        <Badge variant="light">
                            {volumeCountLabel(series.volumes)}
                        </Badge>
                        {/* Note des lecteurs (fiches en ligne), sur 5. */}
                        {series.rating != null && (
                            <Badge
                                variant="light"
                                color="yellow"
                                title="Note des lecteurs, sur 5"
                            >
                                {ratingLabel(series.rating)}
                            </Badge>
                        )}
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
                    {series.summary && (
                        <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                            {series.summary}
                        </Text>
                    )}
                    {/* Fiches en ligne de la série, sous le résumé, le plus
                        discrètement possible. */}
                    {series.sources.length > 0 && (
                        <Text size="xs" c="dimmed" mt={-4}>
                            Sources :{' '}
                            {series.sources.map((link, index) => (
                                <Fragment key={link.site}>
                                    {index > 0 && ' · '}
                                    <Anchor
                                        href={sourceUrl(link)}
                                        target="_blank"
                                        rel="noreferrer"
                                        size="xs"
                                        c="dimmed"
                                        underline="hover"
                                    >
                                        {SOURCE_LABELS[link.site]}
                                    </Anchor>
                                </Fragment>
                            ))}
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
                                </Menu.Dropdown>
                            </Menu>
                            {/* Télécharger : son propre petit menu. */}
                            <Menu position="bottom-start">
                                <Tooltip label="Télécharger sur l’appareil">
                                    <Menu.Target>
                                        <ActionIcon
                                            variant="default"
                                            size="lg"
                                            aria-label="Télécharger"
                                            disabled={
                                                readOnly ||
                                                toDownload.length === 0
                                            }
                                        >
                                            <IconDownload size={18} />
                                        </ActionIcon>
                                    </Menu.Target>
                                </Tooltip>
                                <Menu.Dropdown>
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
