import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { formatSize } from '@/components/format';
import { deleteDraft } from '@/services/api';

/**
 * « Supprimer du disque » d'un brouillon : ses tomes et les autres fichiers
 * de son dossier, après confirmation.
 */
export const DeleteDraftButton = ({
    libraryId,
    folder,
    label,
    volumeCount,
    size,
    onDeleted,
}: {
    libraryId: number;
    folder: string;
    /** Nom montré (dossier sans `_draft/`). */
    label: string;
    volumeCount: number;
    /** Taille de ses tomes, en octets. */
    size: number;
    onDeleted: () => void;
}) => {
    const [opened, setOpened] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const tomes = `${volumeCount} tome${volumeCount > 1 ? 's' : ''}`;

    const close = () => {
        if (busy) return;
        setOpened(false);
        setError(undefined);
    };

    const run = async () => {
        setBusy(true);
        setError(undefined);
        try {
            await deleteDraft(libraryId, folder);
            setOpened(false);
            onDeleted();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Button
                color="red"
                variant="light"
                size="xs"
                leftSection={<IconTrash size={14} />}
                onClick={() => setOpened(true)}
            >
                Supprimer du disque
            </Button>
            <Modal opened={opened} onClose={close} title="Supprimer du disque">
                <Stack>
                    <Text size="sm">
                        Les {tomes} de « {label} » ({formatSize(size)}) et les
                        autres fichiers de son dossier seront effacés du disque,
                        sans corbeille.
                    </Text>
                    {error && <Alert color="red">{error}</Alert>}
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={close}
                            disabled={busy}
                        >
                            Annuler
                        </Button>
                        <Button
                            color="red"
                            loading={busy}
                            onClick={() => void run()}
                        >
                            {`Supprimer ${tomes}`}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
};
