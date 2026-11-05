import {
    ActionIcon,
    Alert,
    Anchor,
    Button,
    Group,
    Loader,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';

import {
    type Collection,
    createCollection,
    deleteCollection,
    fetchCollections,
    renameCollection,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Nom d'une collection, modifiable sur place. */
const NameCell = ({
    collection,
    onRename,
}: {
    collection: Collection;
    onRename: (name: string) => Promise<void>;
}) => {
    const [name, setName] = useState(collection.name);
    const changed = name.trim() !== collection.name && name.trim() !== '';
    return (
        <Group gap={4} wrap="nowrap">
            <TextInput
                size="xs"
                aria-label={`Nom de ${collection.name}`}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && changed) {
                        void onRename(name.trim());
                    }
                }}
                style={{ flex: 1 }}
            />
            {changed && (
                <>
                    <ActionIcon
                        variant="subtle"
                        aria-label="Renommer"
                        onClick={() => void onRename(name.trim())}
                    >
                        <IconCheck size={16} />
                    </ActionIcon>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Annuler"
                        onClick={() => setName(collection.name)}
                    >
                        <IconX size={16} />
                    </ActionIcon>
                </>
            )}
        </Group>
    );
};

/** Collections partagées (admin) : créer, renommer, supprimer. */
export const CollectionsPage = () => {
    const { data: collections, error, reload } = useQuery(fetchCollections, []);
    const [name, setName] = useState('');
    const [actionError, setActionError] = useState<string>();
    const [creating, setCreating] = useState(false);

    const run = async (action: () => Promise<unknown>) => {
        setActionError(undefined);
        try {
            await action();
            reload();
        } catch (e) {
            setActionError((e as Error).message);
        }
    };

    const create = async () => {
        setCreating(true);
        await run(async () => {
            await createCollection(name.trim());
            setName('');
        });
        setCreating(false);
    };

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!collections) return <Loader mx="auto" />;

    return (
        <Stack>
            <Title order={2}>Collections</Title>
            <Text size="sm" c="dimmed">
                Des sélections partagées, visibles de tous dans la liste de
                l’accueil (chacun n’y voit que les séries permises par son
                contrôle parental). Pour ajouter une série : menu ⋯ de sa fiche,
                « Collections… ».
            </Text>
            {actionError && <Alert color="red">{actionError}</Alert>}
            <Group gap="xs" align="flex-end">
                <TextInput
                    label="Nouvelle collection"
                    placeholder="Pour les enfants"
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && name.trim()) {
                            void create();
                        }
                    }}
                />
                <Button
                    leftSection={<IconPlus size={16} />}
                    disabled={!name.trim()}
                    loading={creating}
                    onClick={() => void create()}
                >
                    Créer
                </Button>
            </Group>
            {collections.length === 0 ? (
                <Text c="dimmed">Aucune collection pour l’instant.</Text>
            ) : (
                <Table verticalSpacing="xs">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Nom</Table.Th>
                            <Table.Th w={110}>Séries</Table.Th>
                            <Table.Th w={50} />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {collections.map((collection) => (
                            <Table.Tr key={collection.id}>
                                <Table.Td>
                                    <NameCell
                                        key={collection.name}
                                        collection={collection}
                                        onRename={(newName) =>
                                            run(() =>
                                                renameCollection(
                                                    collection.id,
                                                    newName,
                                                ),
                                            )
                                        }
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <Anchor
                                        component={Link}
                                        to={`/?list=collection:${collection.id}`}
                                        size="sm"
                                    >
                                        {collection.seriesCount} série
                                        {collection.seriesCount > 1 ? 's' : ''}
                                    </Anchor>
                                </Table.Td>
                                <Table.Td>
                                    <Tooltip label="Supprimer">
                                        <ActionIcon
                                            variant="subtle"
                                            color="red"
                                            aria-label={`Supprimer ${collection.name}`}
                                            onClick={() => {
                                                if (
                                                    window.confirm(
                                                        `Supprimer la collection « ${collection.name} » ? Les séries restent dans la bibliothèque.`,
                                                    )
                                                ) {
                                                    void run(() =>
                                                        deleteCollection(
                                                            collection.id,
                                                        ),
                                                    );
                                                }
                                            }}
                                        >
                                            <IconTrash size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            )}
        </Stack>
    );
};
