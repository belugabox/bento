import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Group,
    Modal,
    Paper,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { READING_MODES, type ReadingMode } from '@/reader/navigation';
import {
    type SeriesFormat,
    createFormat,
    deleteFormat,
    fetchFormats,
    updateFormat,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

const seriesCountLabel = (count: number) =>
    `${count} série${count > 1 ? 's' : ''}`;

/** Renommer un format. */
const RenameModal = ({
    format,
    onClose,
    onSaved,
}: {
    format: SeriesFormat;
    onClose: () => void;
    onSaved: () => void;
}) => {
    const [name, setName] = useState(format.name);
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const save = async () => {
        setBusy(true);
        setError(undefined);
        try {
            await updateFormat(format.id, { name });
            onSaved();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <Modal opened onClose={onClose} title={`Format « ${format.name} »`}>
            <Stack>
                <TextInput
                    label="Nom"
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                />
                {error && <Alert color="red">{error}</Alert>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        loading={busy}
                        disabled={!name.trim()}
                        onClick={() => void save()}
                    >
                        Enregistrer
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

/** Supprimer un format : ses séries devront en choisir un autre. */
const DeleteModal = ({
    format,
    onClose,
    onDeleted,
}: {
    format: SeriesFormat;
    onClose: () => void;
    onDeleted: () => void;
}) => {
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const confirm = async () => {
        setBusy(true);
        setError(undefined);
        try {
            await deleteFormat(format.id);
            onDeleted();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <Modal opened onClose={onClose} title={`Supprimer « ${format.name} »`}>
            <Stack>
                <Text size="sm">
                    {format.seriesCount
                        ? `${seriesCountLabel(format.seriesCount)} n’auront plus de format : il faudra le choisir de nouveau.`
                        : 'Aucune série n’utilise ce format.'}
                </Text>
                {error && <Alert color="red">{error}</Alert>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        color="red"
                        loading={busy}
                        onClick={() => void confirm()}
                    >
                        Supprimer
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

/**
 * Formats de série (admin) : obligatoires dans l'éditeur, proposés dans les
 * filtres. Chacun donne son mode de lecture aux séries qui n'en ont pas
 * choisi. Chaque modification est enregistrée tout de suite.
 */
export const FormatsSettings = () => {
    const { data: formats, error, reload } = useQuery(fetchFormats, []);
    const [name, setName] = useState('');
    const [mode, setMode] = useState<ReadingMode>('ltr');
    const [actionError, setActionError] = useState<string>();
    const [renaming, setRenaming] = useState<SeriesFormat>();
    const [deleting, setDeleting] = useState<SeriesFormat>();

    const run = async (task: () => Promise<unknown>) => {
        setActionError(undefined);
        try {
            await task();
            reload();
        } catch (e) {
            setActionError((e as Error).message);
        }
    };

    return (
        <Paper withBorder p="md" radius="md">
            <Stack gap="md">
                <div>
                    <Text fw={600}>Formats</Text>
                    <Text size="sm" c="dimmed">
                        À choisir pour chaque série. Le mode de lecture d’un
                        format s’applique aux séries qui n’en ont pas choisi.
                    </Text>
                </div>
                {error && <Alert color="red">{error.message}</Alert>}
                {actionError && <Alert color="red">{actionError}</Alert>}
                <Stack gap="xs">
                    {(formats ?? []).map((format) => (
                        <Group
                            key={format.id}
                            justify="space-between"
                            wrap="nowrap"
                        >
                            <Group
                                gap="xs"
                                wrap="nowrap"
                                style={{ minWidth: 0 }}
                            >
                                <Text size="sm" truncate>
                                    {format.name}
                                </Text>
                                <Badge size="xs" variant="light" color="gray">
                                    {seriesCountLabel(format.seriesCount)}
                                </Badge>
                            </Group>
                            <Group gap={4} wrap="nowrap">
                                <Select
                                    size="xs"
                                    w={190}
                                    allowDeselect={false}
                                    aria-label={`Mode de lecture de ${format.name}`}
                                    value={format.readingMode}
                                    onChange={(value) =>
                                        value &&
                                        void run(() =>
                                            updateFormat(format.id, {
                                                readingMode:
                                                    value as ReadingMode,
                                            }),
                                        )
                                    }
                                    data={READING_MODES}
                                />
                                <Tooltip label="Renommer">
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        aria-label={`Renommer ${format.name}`}
                                        onClick={() => setRenaming(format)}
                                    >
                                        <IconPencil size={16} />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Supprimer">
                                    <ActionIcon
                                        variant="subtle"
                                        color="red"
                                        aria-label={`Supprimer ${format.name}`}
                                        onClick={() => setDeleting(format)}
                                    >
                                        <IconTrash size={16} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                    ))}
                </Stack>
                <Group align="flex-start" wrap="nowrap" gap="xs">
                    <TextInput
                        style={{ flex: 1 }}
                        placeholder="Nouveau format"
                        aria-label="Nouveau format"
                        value={name}
                        onChange={(e) => setName(e.currentTarget.value)}
                    />
                    <Select
                        w={190}
                        allowDeselect={false}
                        aria-label="Mode de lecture du nouveau format"
                        value={mode}
                        onChange={(value) =>
                            value && setMode(value as ReadingMode)
                        }
                        data={READING_MODES}
                    />
                    <Button
                        variant="default"
                        leftSection={<IconPlus size={16} />}
                        disabled={!name.trim()}
                        onClick={() =>
                            void run(async () => {
                                await createFormat(name, mode);
                                setName('');
                            })
                        }
                    >
                        Ajouter
                    </Button>
                </Group>
            </Stack>
            {renaming && (
                <RenameModal
                    format={renaming}
                    onClose={() => setRenaming(undefined)}
                    onSaved={() => {
                        setRenaming(undefined);
                        reload();
                    }}
                />
            )}
            {deleting && (
                <DeleteModal
                    format={deleting}
                    onClose={() => setDeleting(undefined)}
                    onDeleted={() => {
                        setDeleting(undefined);
                        reload();
                    }}
                />
            )}
        </Paper>
    );
};
