import {
    Alert,
    Button,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { formatSize } from '@/components/format';
import { deleteSeriesFiles, seriesToDraft } from '@/services/api';

export type SeriesFileAction = 'draft' | 'delete';

/**
 * Confirmation des actions sur les fichiers d'une série (menu « ⋯ ») : la
 * remettre en brouillon (ses lectures reviennent à la publication), ou la
 * supprimer du disque.
 */
export const SeriesFileModal = ({
    action,
    onClose,
    seriesId,
    name,
    volumeCount,
    size,
}: {
    /** Action à confirmer ; aucune : fenêtre fermée. */
    action?: SeriesFileAction;
    onClose: () => void;
    seriesId: number;
    name: string;
    volumeCount: number;
    /** Taille de ses tomes, en octets. */
    size: number;
}) => {
    const navigate = useNavigate();
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const tomes = `${volumeCount} tome${volumeCount > 1 ? 's' : ''}`;

    const close = () => {
        if (busy) return;
        setTyped('');
        setError(undefined);
        onClose();
    };

    const run = async () => {
        setBusy(true);
        setError(undefined);
        try {
            if (action === 'draft') {
                const { libraryId, folder } = await seriesToDraft(seriesId);
                navigate(
                    `/drafts?library=${libraryId}&folder=${encodeURIComponent(folder)}`,
                );
            } else {
                const { failures } = await deleteSeriesFiles(seriesId);
                if (failures.length) {
                    setError(
                        failures
                            .map((f) => `${f.path} : ${f.reason}`)
                            .join('\n'),
                    );
                    setBusy(false);
                    return;
                }
                navigate('/', { replace: true });
            }
        } catch (e) {
            setError((e as Error).message);
            setBusy(false);
        }
    };

    return (
        <Modal
            opened={!!action}
            onClose={close}
            title={
                action === 'draft'
                    ? 'Remettre en brouillon'
                    : 'Supprimer du disque'
            }
        >
            <Stack>
                {action === 'draft' ? (
                    <Text size="sm">
                        Les {tomes} de « {name} » vont dans le dossier _draft et
                        la série disparaît pour les lecteurs jusqu'à sa
                        publication. Ses réglages (statut, format, âge, fiches,
                        couverture) suivent le brouillon ; les lectures de
                        chacun et les listes « À lire » reviennent à la
                        publication.
                    </Text>
                ) : (
                    <>
                        <Text size="sm">
                            Les {tomes} de « {name} » ({formatSize(size)})
                            seront effacés du disque, sans corbeille. Les
                            lectures de chacun sont perdues ; le temps de
                            lecture reste dans les statistiques.
                        </Text>
                        <TextInput
                            label="Pour confirmer, tape le nom de la série"
                            value={typed}
                            onChange={(e) => setTyped(e.currentTarget.value)}
                            data-autofocus
                        />
                    </>
                )}
                {error && (
                    <Alert color="red" style={{ whiteSpace: 'pre-line' }}>
                        {error}
                    </Alert>
                )}
                <Group justify="flex-end">
                    <Button variant="default" onClick={close} disabled={busy}>
                        Annuler
                    </Button>
                    <Button
                        color={action === 'delete' ? 'red' : undefined}
                        loading={busy}
                        disabled={action === 'delete' && typed.trim() !== name}
                        onClick={() => void run()}
                    >
                        {action === 'draft'
                            ? 'Remettre en brouillon'
                            : `Supprimer ${tomes}`}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
