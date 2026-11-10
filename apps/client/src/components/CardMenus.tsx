import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Modal,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconBookmark,
    IconBookmarkOff,
    IconCheck,
    IconChecks,
    IconDotsVertical,
    IconEye,
    IconPencil,
    IconPhoto,
    IconPlayerPlay,
    IconPlayerSkipBack,
    IconRotate,
    IconX,
} from '@tabler/icons-react';
import { useContext, useState } from 'react';
import { useNavigate } from 'react-router';

import { nextToRead, volumeLabel } from '@/components/readingStatus';
import {
    type SavedProgress,
    fetchSeries,
    markSeriesRead,
    restoreProgress,
    saveProgress,
    setSeriesCover,
    setSeriesLists,
} from '@/services/api';
import { UserContext, useReadOnly } from '@/services/auth';
import { useQuery } from '@/services/useQuery';

/** Durée du message « Annuler » après une action. */
const UNDO_MS = 6000;

/**
 * Message après une action, avec « Annuler » pendant quelques secondes ;
 * `onChanged` recharge l'accueil après l'action comme après l'annulation.
 */
const notifyDone = (
    message: string,
    undo: (() => Promise<unknown>) | undefined,
    onChanged: () => void,
) => {
    const id = notifications.show({
        autoClose: UNDO_MS,
        // Croix toujours là : le message se ferme tout de suite.
        withCloseButton: true,
        message: (
            <Group justify="space-between" wrap="nowrap" gap="sm">
                <Text size="sm">{message}</Text>
                {undo && (
                    <Button
                        size="compact-sm"
                        variant="subtle"
                        onClick={() => {
                            notifications.hide(id);
                            void undo().then(onChanged, (e: Error) =>
                                notifications.show({
                                    color: 'red',
                                    message: e.message,
                                }),
                            );
                        }}
                    >
                        Annuler
                    </Button>
                )}
            </Group>
        ),
    });
};

/** Lance une action du menu : message, ou erreur en rouge. */
const runAction = async (
    action: () => Promise<{ message: string; undo?: () => Promise<unknown> }>,
    onChanged: () => void,
) => {
    try {
        const { message, undo } = await action();
        onChanged();
        notifyDone(message, undo, onChanged);
    } catch (e) {
        notifications.show({ color: 'red', message: (e as Error).message });
    }
};

/**
 * Bouton ⋮ des cartes (élément, pas composant : `Menu.Target` lui ajoute
 * ses propriétés). Il est hors du lien de la carte.
 */
const dots = (label: string) => (
    <ActionIcon variant="subtle" color="gray" size="sm" aria-label={label}>
        <IconDotsVertical size={16} />
    </ActionIcon>
);

const undoProgress = (previous: SavedProgress[]) => () =>
    restoreProgress(previous);

/** Choix du tome jusqu'auquel la série est lue. */
const UpToModal = ({
    seriesId,
    seriesName,
    onClose,
    onChanged,
}: {
    seriesId: number;
    seriesName: string;
    onClose: () => void;
    onChanged: () => void;
}) => {
    const { data: series } = useQuery(() => fetchSeries(seriesId), [seriesId]);
    const volumes = series?.volumes.map((v) => ({
        value: String(v.id),
        label: volumeLabel(v),
    }));
    const [upTo, setUpTo] = useState<string | null>(null);
    return (
        <Modal opened onClose={onClose} title={`${seriesName} : lu jusqu’au…`}>
            <Stack>
                <Select
                    label="Dernier tome lu"
                    placeholder={volumes ? 'Choisir un tome' : 'Chargement…'}
                    searchable
                    data={volumes ?? []}
                    value={upTo}
                    onChange={setUpTo}
                />
                <Text size="xs" c="dimmed">
                    Ce tome et ceux d’avant sont marqués comme lus ; les
                    suivants ne changent pas.
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        disabled={!upTo}
                        onClick={() => {
                            onClose();
                            void runAction(async () => {
                                const result = await markSeriesRead(
                                    seriesId,
                                    true,
                                    Number(upTo),
                                );
                                return {
                                    message: `${result.volumes} tome${result.volumes > 1 ? 's' : ''} marqué${result.volumes > 1 ? 's' : ''} comme lu${result.volumes > 1 ? 's' : ''}.`,
                                    undo: undoProgress(result.previous),
                                };
                            }, onChanged);
                        }}
                    >
                        Marquer comme lus
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

/** Menu ⋮ d'une série de la grille : lecture, « À lire », gestion. */
export const SeriesCardMenu = ({
    series,
    isAdmin,
    onChanged,
}: {
    series: {
        id: number;
        name: string;
        volumeCount: number;
        readCount: number;
        startedCount: number;
        toRead?: boolean;
    };
    isAdmin: boolean;
    onChanged: () => void;
}) => {
    const navigate = useNavigate();
    const readOnly = useReadOnly();
    const [upToOpened, setUpToOpened] = useState(false);
    const allRead = series.readCount >= series.volumeCount;
    const started = series.startedCount > 0;

    /** Ouvre le tome à lire, comme le bouton de la fiche. */
    const read = async () => {
        try {
            const next = nextToRead((await fetchSeries(series.id)).volumes);
            if (next) {
                navigate(
                    `/read/${next.volume.id}${next.action === 'reread' ? '?page=1' : ''}`,
                );
            }
        } catch (e) {
            notifications.show({ color: 'red', message: (e as Error).message });
        }
    };

    const mark = (readNow: boolean) => {
        if (
            !readNow &&
            !window.confirm(
                `Marquer « ${series.name} » comme non lue ? La progression de lecture sera effacée.`,
            )
        ) {
            return;
        }
        void runAction(async () => {
            const result = await markSeriesRead(series.id, readNow);
            return {
                message: readNow
                    ? 'Série marquée comme lue.'
                    : 'Série marquée comme non lue.',
                undo: undoProgress(result.previous),
            };
        }, onChanged);
    };

    const toggleToRead = (toRead: boolean) =>
        void runAction(async () => {
            await setSeriesLists(series.id, { toRead });
            return {
                message: toRead
                    ? 'Ajoutée à « À lire ».'
                    : 'Retirée de « À lire ».',
                undo: () => setSeriesLists(series.id, { toRead: !toRead }),
            };
        }, onChanged);

    return (
        <>
            <Menu position="bottom-end" withinPortal>
                <Menu.Target>{dots(`Actions pour ${series.name}`)}</Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={<IconPlayerPlay size={14} />}
                        onClick={() => void read()}
                    >
                        {allRead ? 'Relire' : started ? 'Reprendre' : 'Lire'}
                    </Menu.Item>
                    <Menu.Divider />
                    {!allRead && (
                        <Menu.Item
                            leftSection={<IconChecks size={14} />}
                            disabled={readOnly}
                            onClick={() => mark(true)}
                        >
                            Marquer comme lue
                        </Menu.Item>
                    )}
                    {series.volumeCount > 1 && (
                        <Menu.Item
                            leftSection={<IconCheck size={14} />}
                            disabled={readOnly}
                            onClick={() => setUpToOpened(true)}
                        >
                            Marquer lue jusqu’au tome…
                        </Menu.Item>
                    )}
                    {started && (
                        <Menu.Item
                            leftSection={<IconRotate size={14} />}
                            disabled={readOnly}
                            onClick={() => mark(false)}
                        >
                            Marquer comme non lue
                        </Menu.Item>
                    )}
                    <Menu.Divider />
                    {series.toRead ? (
                        <Menu.Item
                            leftSection={<IconBookmarkOff size={14} />}
                            disabled={readOnly}
                            onClick={() => toggleToRead(false)}
                        >
                            Retirer de « À lire »
                        </Menu.Item>
                    ) : (
                        <Menu.Item
                            leftSection={<IconBookmark size={14} />}
                            disabled={readOnly}
                            onClick={() => toggleToRead(true)}
                        >
                            Ajouter à « À lire »
                        </Menu.Item>
                    )}
                    {isAdmin && (
                        <>
                            <Menu.Divider />
                            <Menu.Item
                                leftSection={<IconPencil size={14} />}
                                onClick={() =>
                                    navigate(`/series/${series.id}/edit`)
                                }
                            >
                                Modifier la série
                            </Menu.Item>
                        </>
                    )}
                </Menu.Dropdown>
            </Menu>
            {upToOpened && (
                <UpToModal
                    seriesId={series.id}
                    seriesName={series.name}
                    onClose={() => setUpToOpened(false)}
                    onChanged={onChanged}
                />
            )}
        </>
    );
};

/**
 * Menu ⋮ d'un tome à reprendre (accueil) : ce tome, la série (lue en entier
 * ou jusqu'à ce tome), « Reprendre », et la fiche.
 */
export const VolumeCardMenu = ({
    volume,
    onChanged,
}: {
    volume: {
        volumeId: number;
        seriesId: number;
        seriesName: string;
        number: string | null;
        title: string | null;
        /** Page atteinte ; null : tome suivant, pas encore ouvert. */
        page: number | null;
    };
    onChanged: () => void;
}) => {
    const navigate = useNavigate();
    const readOnly = useReadOnly();
    const isAdmin = useContext(UserContext)?.role === 'admin';
    const label = volumeLabel(volume).toLowerCase();

    /** Série lue en entier, ou jusqu'à ce tome. */
    const markSeries = (upTo?: number) =>
        void runAction(async () => {
            const result = await markSeriesRead(volume.seriesId, true, upTo);
            return {
                message:
                    upTo === undefined
                        ? `${volume.seriesName} : série marquée comme lue.`
                        : `${volume.seriesName} : ${result.volumes} tome${result.volumes > 1 ? 's' : ''} marqué${result.volumes > 1 ? 's' : ''} comme lu${result.volumes > 1 ? 's' : ''}.`,
                undo: undoProgress(result.previous),
            };
        }, onChanged);

    const save = (completed: boolean, message: string) =>
        void runAction(async () => {
            const { previous } = await saveProgress(volume.volumeId, {
                completed,
            });
            return { message, undo: undoProgress([previous]) };
        }, onChanged);

    return (
        <Menu position="bottom-end" withinPortal>
            <Menu.Target>
                {dots(`Actions pour ${volume.seriesName}, ${label}`)}
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    leftSection={<IconCheck size={14} />}
                    disabled={readOnly}
                    onClick={() =>
                        save(
                            true,
                            `${volume.seriesName} : ${label} marqué comme lu.`,
                        )
                    }
                >
                    Marquer ce tome comme lu
                </Menu.Item>
                <Menu.Item
                    leftSection={<IconChecks size={14} />}
                    disabled={readOnly}
                    onClick={() => markSeries(volume.volumeId)}
                >
                    Marquer lue jusqu’à ce tome
                </Menu.Item>
                <Menu.Item
                    leftSection={<IconChecks size={14} />}
                    disabled={readOnly}
                    onClick={() => markSeries()}
                >
                    Marquer la série comme lue
                </Menu.Item>
                {volume.page !== null && (
                    <Menu.Item
                        leftSection={<IconX size={14} />}
                        disabled={readOnly}
                        onClick={() =>
                            save(
                                false,
                                `${volume.seriesName} : ${label} retiré de « Reprendre ».`,
                            )
                        }
                    >
                        Retirer de « Reprendre »
                    </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item
                    leftSection={<IconEye size={14} />}
                    onClick={() => navigate(`/series/${volume.seriesId}`)}
                >
                    Voir la série
                </Menu.Item>
                {isAdmin && (
                    <Menu.Item
                        leftSection={<IconPencil size={14} />}
                        onClick={() =>
                            navigate(`/series/${volume.seriesId}/edit`)
                        }
                    >
                        Modifier la série
                    </Menu.Item>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

type SeriesVolume = Awaited<ReturnType<typeof fetchSeries>>['volumes'][number];

/**
 * Menu ⋮ d'un tome de la fiche série : lecture, « lu », « lu jusqu'à ce
 * tome » ; pour l'admin, couverture de la série.
 */
export const SeriesVolumeMenu = ({
    volume,
    series,
    upTo,
    isAdmin,
    onChanged,
}: {
    volume: SeriesVolume;
    series: { id: number; name: string };
    /** « Lu jusqu'à ce tome » : il y a des tomes avant celui-ci. */
    upTo: boolean;
    isAdmin: boolean;
    onChanged: () => void;
}) => {
    const navigate = useNavigate();
    const readOnly = useReadOnly();
    const label = volumeLabel(volume);
    const read = volume.progress?.completed ?? false;
    // Commencé, pas fini : « Continuer », et « Lire depuis le début ».
    const started = !read && (volume.progress?.page ?? 0) > 0;

    const mark = (
        completed: boolean,
        message = `${label} marqué comme ${completed ? 'lu' : 'non lu'}.`,
    ) =>
        void runAction(async () => {
            const { previous } = await saveProgress(volume.id, { completed });
            return {
                message,
                undo: undoProgress([previous]),
            };
        }, onChanged);

    const markUpTo = () =>
        void runAction(async () => {
            const result = await markSeriesRead(series.id, true, volume.id);
            return {
                message: `${result.volumes} tome${result.volumes > 1 ? 's' : ''} marqué${result.volumes > 1 ? 's' : ''} comme lu${result.volumes > 1 ? 's' : ''}.`,
                undo: undoProgress(result.previous),
            };
        }, onChanged);

    const setAsCover = () =>
        void runAction(async () => {
            await setSeriesCover(series.id, {
                type: 'volume',
                volumeId: volume.id,
            });
            return {
                message: `Couverture de la série : ${label.toLowerCase()}.`,
            };
        }, onChanged);

    return (
        <Menu position="bottom-end" withinPortal>
            <Menu.Target>{dots(`Actions pour ${label}`)}</Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    leftSection={<IconPlayerPlay size={14} />}
                    onClick={() =>
                        navigate(`/read/${volume.id}${read ? '?page=1' : ''}`)
                    }
                >
                    {read ? 'Relire' : started ? 'Continuer' : 'Lire'}
                </Menu.Item>
                {started && (
                    <Menu.Item
                        leftSection={<IconPlayerSkipBack size={14} />}
                        onClick={() => navigate(`/read/${volume.id}?page=1`)}
                    >
                        Lire depuis le début
                    </Menu.Item>
                )}
                <Menu.Divider />
                {read ? (
                    <Menu.Item
                        leftSection={<IconRotate size={14} />}
                        disabled={readOnly}
                        onClick={() => mark(false)}
                    >
                        Marquer comme non lu
                    </Menu.Item>
                ) : (
                    <Menu.Item
                        leftSection={<IconCheck size={14} />}
                        disabled={readOnly}
                        onClick={() => mark(true)}
                    >
                        Marquer comme lu
                    </Menu.Item>
                )}
                {upTo && (
                    <Menu.Item
                        leftSection={<IconChecks size={14} />}
                        disabled={readOnly}
                        onClick={markUpTo}
                    >
                        Marquer comme lu jusqu’à ce tome
                    </Menu.Item>
                )}
                {started && (
                    <Menu.Item
                        leftSection={<IconX size={14} />}
                        disabled={readOnly}
                        onClick={() =>
                            mark(false, `${label} : progression effacée.`)
                        }
                    >
                        Effacer la progression
                    </Menu.Item>
                )}
                {isAdmin && (
                    <>
                        <Menu.Divider />
                        <Menu.Item
                            leftSection={<IconPhoto size={14} />}
                            disabled={readOnly}
                            onClick={setAsCover}
                        >
                            Utiliser comme couverture de la série
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<IconPencil size={14} />}
                            onClick={() =>
                                navigate(`/series/${series.id}/edit`)
                            }
                        >
                            Modifier la série
                        </Menu.Item>
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};
