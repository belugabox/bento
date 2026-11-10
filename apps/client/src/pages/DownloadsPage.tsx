import {
    ActionIcon,
    Alert,
    Button,
    Group,
    Menu,
    Progress,
    SimpleGrid,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconDotsVertical, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { CoverCard } from '@/components/CoverCard';
import { formatSize } from '@/components/format';
import { gridColumns, useLibraryDisplay } from '@/components/libraryDisplay';
import { volumeLabel, volumeShortLabel } from '@/components/readingStatus';
import {
    type DownloadedVolume,
    deleteDownload,
    progressOf,
    queueDownloads,
    storageEstimate,
    useDownloads,
} from '@/offline/downloads';
import { coverUrl } from '@/services/api';
import { useCurrentUser } from '@/services/auth';

/** État de lecture d'un tome téléchargé (sur l'appareil ou le serveur). */
const stateOf = (volume: DownloadedVolume) => {
    const progress = progressOf(volume);
    return progress?.completed ? 'read' : progress ? 'started' : 'unread';
};

const GROUPS = [
    { state: 'started', title: 'En cours' },
    { state: 'unread', title: 'À lire' },
    { state: 'read', title: 'Lus' },
] as const;

/**
 * Tomes téléchargés, en blocs (en cours, à lire, lus) ; la carte ouvre le
 * lecteur, son menu supprime le tome de l'appareil. Sert aussi d'accueil
 * hors ligne.
 */
export const DownloadedVolumes = () => {
    const { downloads } = useDownloads();
    const { size } = useLibraryDisplay();
    const sorted = [...downloads].sort(
        (a, b) =>
            a.seriesName.localeCompare(b.seriesName, 'fr') ||
            (a.number ?? '').localeCompare(b.number ?? '', 'fr', {
                numeric: true,
            }),
    );
    if (sorted.length === 0) {
        return (
            <Text c="dimmed" size="sm">
                Aucun tome téléchargé. « Télécharger » est dans le menu ⋮ d’un
                tome, et dans le menu de lecture d’une série.
            </Text>
        );
    }
    return (
        <Stack gap="xl">
            {GROUPS.map(({ state, title }) => {
                const list = sorted.filter((v) => stateOf(v) === state);
                if (list.length === 0) return null;
                return (
                    <Stack
                        key={state}
                        gap={8}
                        component="section"
                        aria-label={title}
                    >
                        <Text
                            size="xs"
                            c="var(--mantine-primary-color-light-color)"
                            fw={600}
                            tt="uppercase"
                            style={{ letterSpacing: '0.08em' }}
                        >
                            {title}{' '}
                            <Text span inherit c="dimmed">
                                · {list.length}
                            </Text>
                        </Text>
                        <SimpleGrid cols={gridColumns(size)} spacing="sm">
                            {list.map((volume) => {
                                const progress = progressOf(volume);
                                return (
                                    <CoverCard
                                        key={volume.id}
                                        to={`/read/${volume.id}`}
                                        cover={coverUrl(
                                            volume.id,
                                            volume.version,
                                            'small',
                                        )}
                                        title={volume.seriesName}
                                        subtitle={`${volumeShortLabel(volume)} · ${formatSize(volume.bytes)}`}
                                        progress={
                                            progress && !progress.completed
                                                ? (progress.page + 1) /
                                                  volume.pageCount
                                                : undefined
                                        }
                                        menu={
                                            <Menu
                                                position="bottom-end"
                                                withinPortal
                                            >
                                                <Menu.Target>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="gray"
                                                        size="sm"
                                                        aria-label={`Actions pour ${volume.seriesName}, ${volumeLabel(volume).toLowerCase()}`}
                                                    >
                                                        <IconDotsVertical
                                                            size={16}
                                                        />
                                                    </ActionIcon>
                                                </Menu.Target>
                                                <Menu.Dropdown>
                                                    <Menu.Item
                                                        color="red"
                                                        leftSection={
                                                            <IconTrash
                                                                size={14}
                                                            />
                                                        }
                                                        onClick={() =>
                                                            void deleteDownload(
                                                                volume.id,
                                                            )
                                                        }
                                                    >
                                                        Supprimer de l’appareil
                                                    </Menu.Item>
                                                </Menu.Dropdown>
                                            </Menu>
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

/** Téléchargements en cours, avec leur avancement ; « Réessayer » si échec. */
const DownloadJobs = () => {
    const { jobs } = useDownloads();
    const user = useCurrentUser();
    if (jobs.length === 0) return null;
    return (
        <Stack gap="xs">
            {jobs.map((job) => (
                <Stack key={job.volumeId} gap={4}>
                    <Group justify="space-between" wrap="nowrap">
                        <Text size="sm" lineClamp={1}>
                            {job.label}
                        </Text>
                        {job.state === 'failed' ? (
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                leftSection={<IconRefresh size={12} />}
                                onClick={() =>
                                    queueDownloads(
                                        [
                                            {
                                                id: job.volumeId,
                                                label: job.label,
                                            },
                                        ],
                                        user.id,
                                    )
                                }
                            >
                                Réessayer
                            </Button>
                        ) : (
                            <Text size="xs" c="dimmed">
                                {job.state === 'waiting'
                                    ? 'En attente'
                                    : `${job.done} / ${job.total} pages`}
                            </Text>
                        )}
                    </Group>
                    {job.state === 'failed' ? (
                        <Text size="xs" c="red">
                            {job.error}
                        </Text>
                    ) : (
                        <Progress
                            value={job.total ? (job.done / job.total) * 100 : 0}
                            size="sm"
                            animated={job.state === 'running'}
                        />
                    )}
                </Stack>
            ))}
        </Stack>
    );
};

/**
 * Téléchargements de l'appareil : en cours, place prise et libre, tomes
 * gardés ; suppression des tomes lus, ou de tout.
 */
export const DownloadsPage = () => {
    const { downloads } = useDownloads();
    const [storage, setStorage] = useState<{
        used: number;
        available?: number;
    }>();
    useEffect(() => {
        void storageEstimate().then(setStorage);
    }, [downloads]);
    const read = downloads.filter((v) => stateOf(v) === 'read');

    return (
        <Stack>
            <div>
                <Title order={2}>Téléchargements</Title>
                <Text size="sm" c="dimmed">
                    Tomes gardés sur cet appareil, pour les lire sans réseau.
                    Ils sont effacés à la déconnexion.
                </Text>
            </div>
            {storage && (
                <Text size="sm">
                    {downloads.length} tome{downloads.length > 1 ? 's' : ''} ·{' '}
                    {formatSize(storage.used)}
                    {storage.available !== undefined &&
                        ` · ${formatSize(storage.available)} libres sur l’appareil`}
                </Text>
            )}
            {typeof caches === 'undefined' && (
                <Alert color="yellow">
                    Ce navigateur ne permet pas de télécharger des tomes.
                </Alert>
            )}
            <DownloadJobs />
            <DownloadedVolumes />
            {downloads.length > 0 && (
                <Group>
                    <Button
                        variant="default"
                        disabled={read.length === 0}
                        onClick={() =>
                            void (async () => {
                                for (const volume of read) {
                                    await deleteDownload(volume.id);
                                }
                            })()
                        }
                    >
                        Supprimer les tomes lus ({read.length})
                    </Button>
                    <Button
                        variant="subtle"
                        color="red"
                        onClick={() => {
                            if (
                                window.confirm(
                                    'Supprimer tous les tomes téléchargés de cet appareil ?',
                                )
                            ) {
                                void (async () => {
                                    for (const volume of downloads) {
                                        await deleteDownload(volume.id);
                                    }
                                })();
                            }
                        }}
                    >
                        Tout supprimer
                    </Button>
                </Group>
            )}
        </Stack>
    );
};
