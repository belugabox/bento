import {
    Alert,
    Button,
    Checkbox,
    Group,
    Loader,
    Modal,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';

import {
    createCollection,
    fetchCollections,
    setCollectionMember,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Collections partagées d'une série (admin) : cocher, ou en créer une. */
export const CollectionsModal = ({
    opened,
    onClose,
    seriesId,
    collectionIds,
    onChanged,
}: {
    opened: boolean;
    onClose: () => void;
    seriesId: number;
    collectionIds: number[];
    onChanged: () => void;
}) => {
    const collections = useQuery(
        () => (opened ? fetchCollections() : Promise.resolve(undefined)),
        [opened],
    );
    const [name, setName] = useState('');
    const [busy, setBusy] = useState<number | 'new'>();
    const [error, setError] = useState<string>();

    const run = async (key: number | 'new', action: () => Promise<unknown>) => {
        setBusy(key);
        setError(undefined);
        try {
            await action();
            onChanged();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(undefined);
        }
    };

    const create = () =>
        run('new', async () => {
            const created = await createCollection(name.trim());
            await setCollectionMember(created.id, seriesId, true);
            setName('');
            collections.reload();
        });

    return (
        <Modal opened={opened} onClose={onClose} title="Collections">
            <Stack>
                <Text size="sm" c="dimmed">
                    Les collections sont partagées : tout le monde les voit dans
                    la liste de l’accueil (selon son contrôle parental).
                </Text>
                {error && <Alert color="red">{error}</Alert>}
                {!collections.data && <Loader size="sm" mx="auto" />}
                {collections.data?.length === 0 && (
                    <Text size="sm" c="dimmed">
                        Aucune collection pour l’instant.
                    </Text>
                )}
                {collections.data?.map((collection) => (
                    <Group key={collection.id} gap="xs">
                        <Checkbox
                            label={collection.name}
                            checked={collectionIds.includes(collection.id)}
                            disabled={busy !== undefined}
                            onChange={(event) => {
                                const member = event.currentTarget.checked;
                                void run(collection.id, () =>
                                    setCollectionMember(
                                        collection.id,
                                        seriesId,
                                        member,
                                    ),
                                );
                            }}
                        />
                        {busy === collection.id && <Loader size="xs" />}
                    </Group>
                ))}
                <Group gap="xs" align="flex-end">
                    <TextInput
                        style={{ flex: 1 }}
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
                        loading={busy === 'new'}
                        onClick={() => void create()}
                    >
                        Créer et ajouter
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
