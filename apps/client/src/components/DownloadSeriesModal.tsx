import { Button, Group, Modal, Radio, Stack, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';

import { NEXT_VOLUME_COUNTS, nextVolumesLabel } from '@/offline/auto';

/** Un tome à télécharger : son nom court (« T4 »). */
type Candidate = { id: number; short: string };

/**
 * « Télécharger… » de la fiche série (une seule entrée dans le menu « ⋯ »,
 * demandé) : combien de tomes, à partir de celui à lire, pas encore lus ni
 * téléchargés.
 */
export const DownloadSeriesModal = ({
    opened,
    onClose,
    volumes,
    onDownload,
}: {
    opened: boolean;
    onClose: () => void;
    /** Tomes à télécharger, dans l'ordre. */
    volumes: Candidate[];
    onDownload: (count: number) => void;
}) => (
    <Modal opened={opened} onClose={onClose} title="Télécharger sur l’appareil">
        {/* Choix remis à zéro à chaque ouverture. */}
        {opened && (
            <DownloadChoice
                volumes={volumes}
                onDownload={(count) => {
                    onClose();
                    onDownload(count);
                }}
                onCancel={onClose}
            />
        )}
    </Modal>
);

/** « T4 », « T4 à T6 ». */
const rangeOf = (volumes: Candidate[]) =>
    volumes.length === 1
        ? volumes[0]!.short
        : `${volumes[0]!.short} à ${volumes.at(-1)!.short}`;

const DownloadChoice = ({
    volumes,
    onDownload,
    onCancel,
}: {
    volumes: Candidate[];
    onDownload: (count: number) => void;
    onCancel: () => void;
}) => {
    // Les nombres plus petits que ce qui reste, puis « tous ».
    const options = [
        ...NEXT_VOLUME_COUNTS.filter((count) => count < volumes.length).map(
            (count) => ({ count, label: nextVolumesLabel(count) }),
        ),
        {
            count: volumes.length,
            label:
                volumes.length === 1
                    ? nextVolumesLabel(1)
                    : `Tous les tomes pas lus (${volumes.length})`,
        },
    ];
    const [count, setCount] = useState(String(options[0]?.count ?? 0));

    if (volumes.length === 0) {
        return (
            <Text size="sm" c="dimmed">
                Tous les tomes pas lus sont déjà sur l’appareil.
            </Text>
        );
    }
    return (
        <Stack>
            <Text size="sm" c="dimmed">
                À partir du tome à lire, sans ceux déjà lus ou déjà téléchargés.
                Ils se lisent ensuite sans réseau.
            </Text>
            <Radio.Group value={count} onChange={setCount}>
                <Stack gap="sm">
                    {options.map((option) => (
                        <Radio
                            key={option.count}
                            value={String(option.count)}
                            label={option.label}
                            description={rangeOf(
                                volumes.slice(0, option.count),
                            )}
                        />
                    ))}
                </Stack>
            </Radio.Group>
            <Group justify="flex-end">
                <Button variant="default" onClick={onCancel}>
                    Annuler
                </Button>
                <Button
                    leftSection={<IconDownload size={16} />}
                    onClick={() => onDownload(Number(count))}
                >
                    Télécharger
                </Button>
            </Group>
        </Stack>
    );
};
