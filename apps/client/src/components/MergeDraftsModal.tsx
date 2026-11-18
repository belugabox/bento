import {
    Alert,
    Button,
    Group,
    List,
    Modal,
    MultiSelect,
    Stack,
    Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import { draftLabel } from '@/components/draftLabel';
import { mergeDrafts } from '@/services/api';

/**
 * Fusion de brouillons d'une même série, reçue un dossier par tome : les
 * tomes des brouillons choisis rejoignent `into` (bandeau de la page ou
 * « Fusionner avec… » du menu « ⋯ »).
 */
export const MergeDraftsModal = ({
    opened,
    onClose,
    libraryId,
    into,
    candidates,
    initial,
    onMerged,
}: {
    opened: boolean;
    onClose: () => void;
    libraryId: number;
    into: string;
    /** Brouillons qui peuvent la rejoindre (sans `into`). */
    candidates: string[];
    /** Brouillons cochés à l'ouverture. */
    initial: string[];
    /** Dossier obtenu (un tome seul devient un dossier au nom de la série). */
    onMerged: (folder: string) => void;
}) => {
    const [from, setFrom] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    const close = () => {
        if (busy) return;
        setError(undefined);
        onClose();
    };

    const run = async () => {
        setBusy(true);
        setError(undefined);
        try {
            const result = await mergeDrafts(libraryId, into, from);
            if (result.failures.length > 0) {
                notifications.show({
                    color: 'orange',
                    title: `${result.moved} tome(s) déplacé(s), ${result.failures.length} laissé(s) en place`,
                    message: result.failures
                        .map((f) => `${f.path} : ${f.reason}`)
                        .join('\n'),
                    autoClose: false,
                });
            } else {
                notifications.show({
                    message: `${result.moved} fichier(s) réunis dans « ${draftLabel(result.folder)} ».`,
                });
            }
            onClose();
            onMerged(result.folder);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal opened={opened} onClose={close} title="Fusionner des brouillons">
            <Stack>
                <Text size="sm">
                    {`Les tomes des brouillons choisis rejoignent « ${draftLabel(into)} », avec ses réglages (ceux des autres sont oubliés). Un fichier du même nom n'est jamais écrasé.`}
                </Text>
                <MultiSelect
                    label="Brouillons à réunir"
                    data={candidates.map((folder) => ({
                        value: folder,
                        label: draftLabel(folder),
                    }))}
                    value={from}
                    onChange={setFrom}
                    searchable
                    clearable
                    comboboxProps={{ withinPortal: true }}
                />
                {from.length > 0 && (
                    <List size="sm" c="dimmed">
                        {from.map((folder) => (
                            <List.Item key={folder}>
                                {draftLabel(folder)} → {draftLabel(into)}
                            </List.Item>
                        ))}
                    </List>
                )}
                {error && <Alert color="red">{error}</Alert>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={close} disabled={busy}>
                        Annuler
                    </Button>
                    <Button
                        loading={busy}
                        disabled={from.length === 0}
                        onClick={() => void run()}
                    >
                        Fusionner
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
