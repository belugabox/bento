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
    IconPlayerPlay,
    IconRotate,
    IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { nextToRead, volumeLabel } from '@/components/readingStatus';
import {
    type SavedProgress,
    fetchSeries,
    markSeriesRead,
    restoreProgress,
    saveProgress,
    setSeriesLists,
} from '@/services/api';
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
        withCloseButton: !undo,
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
                            onClick={() => mark(true)}
                        >
                            Marquer comme lue
                        </Menu.Item>
                    )}
                    {series.volumeCount > 1 && (
                        <Menu.Item
                            leftSection={<IconCheck size={14} />}
                            onClick={() => setUpToOpened(true)}
                        >
                            Marquer lue jusqu’au tome…
                        </Menu.Item>
                    )}
                    {started && (
                        <Menu.Item
                            leftSection={<IconRotate size={14} />}
                            onClick={() => mark(false)}
                        >
                            Marquer comme non lue
                        </Menu.Item>
                    )}
                    <Menu.Divider />
                    {series.toRead ? (
                        <Menu.Item
                            leftSection={<IconBookmarkOff size={14} />}
                            onClick={() => toggleToRead(false)}
                        >
                            Retirer de « À lire »
                        </Menu.Item>
                    ) : (
                        <Menu.Item
                            leftSection={<IconBookmark size={14} />}
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

/** Menu ⋮ d'un tome de « Reprendre la lecture ». */
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
    const label = volumeLabel(volume).toLowerCase();

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
                    onClick={() =>
                        save(
                            true,
                            `${volume.seriesName} : ${label} marqué comme lu.`,
                        )
                    }
                >
                    Marquer ce tome comme lu
                </Menu.Item>
                {volume.page !== null && (
                    <Menu.Item
                        leftSection={<IconX size={14} />}
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
            </Menu.Dropdown>
        </Menu>
    );
};
