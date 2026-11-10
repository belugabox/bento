import {
    ActionIcon,
    Alert,
    Button,
    Card,
    Center,
    Group,
    Image,
    Loader,
    Menu,
    Paper,
    Progress,
    Select,
    SimpleGrid,
    Stack,
    Switch,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconDotsVertical,
    IconDownload,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { CoverCard } from '@/components/CoverCard';
import { formatSize } from '@/components/format';
import { gridColumns, useLibraryDisplay } from '@/components/libraryDisplay';
import { volumeLabel, volumeShortLabel } from '@/components/readingStatus';
import {
    AUTO_SERIES,
    type AutoSettings,
    CLEAN_DAYS,
    type Proposal,
    fetchProposals,
    runAutoDownloads,
    useAutoSettings,
} from '@/offline/auto';
import {
    type DownloadedVolume,
    clearDownloads,
    deleteDownload,
    progressOf,
    queueDownloads,
    storageEstimate,
    useDownloads,
} from '@/offline/downloads';
import { coverUrl } from '@/services/api';
import { useCurrentUser, useReadOnly } from '@/services/auth';
import { useOnline } from '@/services/network';
import { useQuery } from '@/services/useQuery';

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

/** « Le tome en cours et les 2 suivants » : les tomes proposés par série. */
const proposedLabel = (count: number) =>
    count === 1
        ? 'Le tome en cours'
        : count === 2
          ? 'Le tome en cours et le suivant'
          : `Le tome en cours et les ${count - 1} suivants`;

/** Titre d'une partie de la page, avec ses boutons à droite. */
const Section = ({
    title,
    description,
    actions,
    children,
}: {
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
}) => (
    <Stack gap="sm" component="section" aria-label={title}>
        <Group justify="space-between" align="flex-end" gap="xs">
            <div>
                <Title order={4}>{title}</Title>
                {description && (
                    <Text size="sm" c="dimmed">
                        {description}
                    </Text>
                )}
            </div>
            {actions && <Group gap="xs">{actions}</Group>}
        </Group>
        {children}
    </Stack>
);

/** Couverture d'une ligne (ou une case vide, avant la fin du téléchargement). */
const RowCover = ({ src }: { src?: string }) =>
    src ? (
        <Image
            src={src}
            w={40}
            h={60}
            fit="cover"
            radius="sm"
            alt=""
            style={{ flexShrink: 0 }}
        />
    ) : (
        <Center
            w={40}
            h={60}
            bg="var(--mantine-color-default-hover)"
            style={{ flexShrink: 0, borderRadius: 'var(--mantine-radius-sm)' }}
        >
            <IconDownload size={16} opacity={0.5} />
        </Center>
    );

/**
 * Ligne d'un tome : couverture, nom, détail, et à droite ses boutons ;
 * `to` : un clic ouvre le lecteur.
 */
const Row = ({
    cover,
    title,
    detail,
    to,
    progress,
    actions,
}: {
    cover?: string;
    title: string;
    detail: ReactNode;
    to?: string;
    progress?: ReactNode;
    actions: ReactNode;
}) => {
    const body = (
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <RowCover src={cover} />
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={500} lineClamp={1}>
                    {title}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={1}>
                    {detail}
                </Text>
                {progress}
            </Stack>
        </Group>
    );
    return (
        <Card withBorder padding="xs" radius="md">
            <Group gap="sm" wrap="nowrap">
                {to ? (
                    <UnstyledButton
                        component={Link}
                        to={to}
                        style={{ flex: 1, minWidth: 0, display: 'flex' }}
                    >
                        {body}
                    </UnstyledButton>
                ) : (
                    body
                )}
                <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                    {actions}
                </Group>
            </Group>
        </Card>
    );
};

/** Corbeille d'une ligne : supprime le tome, ou arrête son téléchargement. */
const DeleteButton = ({ id, label }: { id: number; label: string }) => (
    <Tooltip label="Supprimer de l’appareil">
        <ActionIcon
            variant="subtle"
            color="red"
            size="lg"
            aria-label={`Supprimer ${label}`}
            onClick={() => void deleteDownload(id)}
        >
            <IconTrash size={18} />
        </ActionIcon>
    </Tooltip>
);

/** Où en est la lecture d'un tome téléchargé. */
const readingDetail = (volume: DownloadedVolume) => {
    const progress = progressOf(volume);
    if (progress?.completed) return 'Lu';
    if (progress) return `Page ${progress.page + 1} sur ${volume.pageCount}`;
    return 'Pas commencé';
};

/**
 * Tomes de l'appareil, en liste : téléchargements en cours d'abord (avec
 * leur avancement), puis les tomes gardés, par série.
 */
const DeviceVolumes = () => {
    const { downloads, jobs } = useDownloads();
    const user = useCurrentUser();
    const sorted = [...downloads].sort(
        (a, b) =>
            a.seriesName.localeCompare(b.seriesName, 'fr') ||
            (a.number ?? '').localeCompare(b.number ?? '', 'fr', {
                numeric: true,
            }),
    );
    if (jobs.length === 0 && sorted.length === 0) {
        return (
            <Text size="sm" c="dimmed">
                Aucun tome sur l’appareil. Télécharge les propositions
                ci-dessous, ou un tome depuis son menu ⋮ sur la fiche d’une
                série.
            </Text>
        );
    }
    return (
        <Stack gap="xs">
            {jobs.map((job) => (
                <Row
                    key={`job-${job.volumeId}`}
                    title={job.label}
                    detail={
                        job.state === 'failed' ? (
                            <Text span inherit c="red">
                                {job.error}
                            </Text>
                        ) : job.state === 'waiting' ? (
                            'En attente'
                        ) : (
                            `Téléchargement : ${job.done} / ${job.total} pages`
                        )
                    }
                    progress={
                        job.state !== 'failed' && (
                            <Progress
                                value={
                                    job.total ? (job.done / job.total) * 100 : 0
                                }
                                size="sm"
                                animated={job.state === 'running'}
                                aria-label={`Téléchargement de ${job.label}`}
                            />
                        )
                    }
                    actions={
                        <>
                            {job.state === 'failed' && (
                                <Tooltip label="Réessayer">
                                    <ActionIcon
                                        variant="subtle"
                                        size="lg"
                                        aria-label={`Réessayer ${job.label}`}
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
                                        <IconRefresh size={18} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                            <DeleteButton id={job.volumeId} label={job.label} />
                        </>
                    }
                />
            ))}
            {sorted.map((volume) => {
                const label = `${volume.seriesName}, ${volumeLabel(volume).toLowerCase()}`;
                return (
                    <Row
                        key={volume.id}
                        to={`/read/${volume.id}`}
                        cover={coverUrl(volume.id, volume.version, 'small')}
                        title={`${volume.seriesName} — ${volumeLabel(volume)}`}
                        detail={`${readingDetail(volume)} · ${formatSize(volume.bytes)}`}
                        actions={<DeleteButton id={volume.id} label={label} />}
                    />
                );
            })}
        </Stack>
    );
};

/**
 * Propositions : le tome en cours et les suivants des séries en cours, pas
 * encore sur l'appareil ; « Télécharger » sur chacun, ou tout d'un coup.
 */
const Proposals = () => {
    const user = useCurrentUser();
    const readOnly = useReadOnly();
    const online = useOnline();
    const auto = useAutoSettings();
    const { downloads, jobs } = useDownloads();
    const proposals = useQuery(
        () =>
            online && typeof caches !== 'undefined'
                ? fetchProposals(auto.count)
                : Promise.resolve(undefined),
        [online, auto.count, downloads.length],
    );
    // Déjà en téléchargement : plus proposé.
    const queued = new Set(
        jobs.filter((j) => j.state !== 'failed').map((j) => j.volumeId),
    );
    const list = (proposals.data ?? []).filter((p) => !queued.has(p.id));
    const download = (items: Proposal[]) =>
        queueDownloads(
            items.map((p) => ({ id: p.id, label: p.label })),
            user.id,
        );

    return (
        <Section
            title="Propositions"
            description={`${proposedLabel(auto.count)}, pour tes ${AUTO_SERIES} séries lues le plus récemment.`}
            actions={
                list.length > 1 && (
                    <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconDownload size={14} />}
                        disabled={readOnly}
                        onClick={() => download(list)}
                    >
                        Tout télécharger ({list.length})
                    </Button>
                )
            }
        >
            {!online ? (
                <Text size="sm" c="dimmed">
                    Les propositions reviennent avec le réseau.
                </Text>
            ) : proposals.error ? (
                <Alert color="red">{proposals.error.message}</Alert>
            ) : !proposals.data ? (
                <Loader size="sm" />
            ) : list.length === 0 ? (
                <Text size="sm" c="dimmed">
                    Rien à proposer : tes séries en cours sont déjà sur
                    l’appareil.
                </Text>
            ) : (
                <Stack gap="xs">
                    {list.map((proposal) => (
                        <Row
                            key={proposal.id}
                            cover={coverUrl(
                                proposal.id,
                                proposal.version,
                                'small',
                            )}
                            title={proposal.label}
                            detail={`${proposal.current ? 'Tome en cours' : 'Tome suivant'} · ${proposal.pageCount} pages`}
                            actions={
                                <Button
                                    size="compact-sm"
                                    variant="light"
                                    leftSection={<IconDownload size={14} />}
                                    disabled={readOnly}
                                    aria-label={`Télécharger ${proposal.label}`}
                                    onClick={() => download([proposal])}
                                >
                                    Télécharger
                                </Button>
                            }
                        />
                    ))}
                </Stack>
            )}
        </Section>
    );
};

/**
 * Mode automatique (réglage de l'appareil) : télécharge tout seul les
 * propositions, et fait le ménage des tomes lus.
 */
const AutoDownloads = () => {
    const auto = useAutoSettings();
    const user = useCurrentUser();
    const readOnly = useReadOnly();
    // Lancé tout de suite après un changement (le prochain passage
    // attendrait une demi-heure).
    const change = (changes: Partial<AutoSettings>) => {
        auto.set(changes);
        setTimeout(
            () => void runAutoDownloads(user.id, true).catch(() => undefined),
        );
    };
    return (
        <Paper withBorder p="md" radius="md">
            <Section
                title="Automatique"
                description="Sur cet appareil, à l’ouverture de Bento puis toutes les 30 minutes."
            >
                <Switch
                    label="Télécharger les propositions tout seul"
                    checked={auto.enabled}
                    disabled={readOnly}
                    onChange={(e) =>
                        change({ enabled: e.currentTarget.checked })
                    }
                />
                <Group gap="md">
                    <Select
                        size="xs"
                        w={260}
                        label="Tomes proposés par série"
                        allowDeselect={false}
                        data={[1, 2, 3, 5].map((n) => ({
                            value: String(n),
                            label: proposedLabel(n),
                        }))}
                        value={String(auto.count)}
                        onChange={(value) => change({ count: Number(value) })}
                    />
                </Group>
                <Switch
                    label="En Wi-Fi seulement"
                    description="Jamais sur les données mobiles (Android)."
                    checked={auto.wifiOnly}
                    disabled={!auto.enabled}
                    onChange={(e) =>
                        change({ wifiOnly: e.currentTarget.checked })
                    }
                />
                <Switch
                    label={`Effacer les tomes lus depuis ${CLEAN_DAYS} jours`}
                    checked={auto.clean}
                    onChange={(e) => change({ clean: e.currentTarget.checked })}
                />
            </Section>
        </Paper>
    );
};

/**
 * Téléchargements de l'appareil : les tomes gardés (en liste, avec leur
 * avancement et une corbeille), les propositions, et le mode automatique à
 * part.
 */
export const DownloadsPage = () => {
    const { downloads, jobs } = useDownloads();
    const [storage, setStorage] = useState<{
        used: number;
        available?: number;
    }>();
    useEffect(() => {
        void storageEstimate().then(setStorage);
    }, [downloads]);
    const read = downloads.filter((v) => stateOf(v) === 'read');
    const count = downloads.length;

    return (
        <Stack gap="xl">
            <div>
                <Title order={2}>Téléchargements</Title>
                <Text size="sm" c="dimmed">
                    Tomes gardés sur cet appareil, pour les lire sans réseau.
                    Ils sont effacés à la déconnexion.
                </Text>
            </div>
            {typeof caches === 'undefined' && (
                <Alert color="yellow">
                    Ce navigateur ne permet pas de télécharger des tomes.
                </Alert>
            )}

            <Section
                title="Sur cet appareil"
                description={
                    storage &&
                    `${count} tome${count > 1 ? 's' : ''} · ${formatSize(storage.used)}${
                        storage.available !== undefined
                            ? ` · ${formatSize(storage.available)} libres`
                            : ''
                    }`
                }
                actions={
                    (count > 0 || jobs.length > 0) && (
                        <>
                            <Button
                                size="xs"
                                variant="light"
                                color="red"
                                leftSection={<IconTrash size={14} />}
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
                                size="xs"
                                variant="subtle"
                                color="red"
                                onClick={() => {
                                    if (
                                        window.confirm(
                                            'Supprimer tous les tomes de cet appareil ?',
                                        )
                                    ) {
                                        void clearDownloads();
                                    }
                                }}
                            >
                                Tout supprimer
                            </Button>
                        </>
                    )
                }
            >
                <DeviceVolumes />
            </Section>

            <Proposals />

            <AutoDownloads />
        </Stack>
    );
};
