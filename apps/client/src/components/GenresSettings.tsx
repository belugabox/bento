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
    TagsInput,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import {
    type Genre,
    createGenre,
    deleteGenre,
    fetchGenres,
    updateGenre,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Renommer un genre et changer les autres noms qu'il reconnaît. */
const EditModal = ({
    genre,
    onClose,
    onSaved,
}: {
    genre: Genre;
    onClose: () => void;
    onSaved: () => void;
}) => {
    const [name, setName] = useState(genre.name);
    const [aliases, setAliases] = useState(genre.aliases);
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const save = async () => {
        setBusy(true);
        setError(undefined);
        try {
            await updateGenre(genre.id, { name, aliases });
            onSaved();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <Modal opened onClose={onClose} title={`Genre « ${genre.name} »`}>
            <Stack>
                <TextInput
                    label="Nom"
                    description="Renommé, l’ancien nom devient un autre nom reconnu."
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                />
                <TagsInput
                    label="Autres noms reconnus"
                    description="Dans les fichiers, ces mots sont rangés dans ce genre."
                    value={aliases}
                    onChange={setAliases}
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

/** Supprimer un genre, ou le fusionner dans un autre. */
const DeleteModal = ({
    genre,
    others,
    onClose,
    onDeleted,
}: {
    genre: Genre;
    others: Genre[];
    onClose: () => void;
    onDeleted: () => void;
}) => {
    const [into, setInto] = useState<string | null>(null);
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const confirm = async () => {
        setBusy(true);
        setError(undefined);
        try {
            await deleteGenre(genre.id, into ? Number(into) : undefined);
            onDeleted();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <Modal opened onClose={onClose} title={`Supprimer « ${genre.name} »`}>
            <Stack>
                <Select
                    label="Fusionner dans"
                    description="Son nom et ses autres noms y seront reconnus. Sans fusion, les séries le gardent comme thème."
                    placeholder="Aucun : supprimer seulement"
                    clearable
                    searchable
                    value={into}
                    onChange={setInto}
                    data={others.map((g) => ({
                        value: String(g.id),
                        label: g.name,
                    }))}
                />
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
                        {into ? 'Fusionner' : 'Supprimer'}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

/**
 * Liste des genres (admin) : les genres proposés dans l'éditeur et les
 * filtres. Chaque modification est enregistrée tout de suite.
 */
export const GenresSettings = () => {
    const { data: genres, error, reload } = useQuery(fetchGenres, []);
    const [name, setName] = useState('');
    const [addError, setAddError] = useState<string>();
    const [editing, setEditing] = useState<Genre>();
    const [deleting, setDeleting] = useState<Genre>();

    const add = async () => {
        setAddError(undefined);
        try {
            await createGenre(name);
            setName('');
            reload();
        } catch (e) {
            setAddError((e as Error).message);
        }
    };

    return (
        <Paper withBorder p="md" radius="md">
            <Stack gap="md">
                <div>
                    <Text fw={600}>Genres</Text>
                    <Text size="sm" c="dimmed">
                        Les genres proposés dans l’éditeur et les filtres. Les
                        autres noms reconnus rangent les genres des fichiers («
                        Humour » dans « Comédie ») ; un mot inconnu devient un
                        thème.
                    </Text>
                </div>
                {error && <Alert color="red">{error.message}</Alert>}
                <Stack gap={4}>
                    {(genres ?? []).map((genre) => (
                        <Group
                            key={genre.id}
                            justify="space-between"
                            wrap="nowrap"
                        >
                            <div style={{ minWidth: 0 }}>
                                <Group gap="xs">
                                    <Text size="sm">{genre.name}</Text>
                                    <Badge
                                        size="xs"
                                        variant="light"
                                        color="gray"
                                    >
                                        {genre.seriesCount} série
                                        {genre.seriesCount > 1 ? 's' : ''}
                                    </Badge>
                                </Group>
                                {genre.aliases.length > 0 && (
                                    <Text size="xs" c="dimmed" truncate>
                                        {genre.aliases.join(', ')}
                                    </Text>
                                )}
                            </div>
                            <Group gap={4} wrap="nowrap">
                                <Tooltip label="Modifier">
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        aria-label={`Modifier ${genre.name}`}
                                        onClick={() => setEditing(genre)}
                                    >
                                        <IconPencil size={16} />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Supprimer ou fusionner">
                                    <ActionIcon
                                        variant="subtle"
                                        color="red"
                                        aria-label={`Supprimer ${genre.name}`}
                                        onClick={() => setDeleting(genre)}
                                    >
                                        <IconTrash size={16} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                    ))}
                </Stack>
                <Group align="flex-start" wrap="nowrap">
                    <TextInput
                        style={{ flex: 1 }}
                        placeholder="Nouveau genre"
                        aria-label="Nouveau genre"
                        value={name}
                        error={addError}
                        onChange={(e) => setName(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && name.trim()) void add();
                        }}
                    />
                    <Button
                        variant="default"
                        leftSection={<IconPlus size={16} />}
                        disabled={!name.trim()}
                        onClick={() => void add()}
                    >
                        Ajouter
                    </Button>
                </Group>
            </Stack>
            {editing && (
                <EditModal
                    genre={editing}
                    onClose={() => setEditing(undefined)}
                    onSaved={() => {
                        setEditing(undefined);
                        reload();
                    }}
                />
            )}
            {deleting && (
                <DeleteModal
                    genre={deleting}
                    others={(genres ?? []).filter((g) => g.id !== deleting.id)}
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
