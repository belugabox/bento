import {
    Box,
    Button,
    Group,
    Popover,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useState } from 'react';

import type { VolumeKind } from '@server/types';

import { volumeLabel } from '@/components/readingStatus';

import {
    MAX_SEGMENTS,
    type SeriesVolume,
    seriesPercent,
    volumeShare,
} from './seriesShare';

type Volume = SeriesVolume & {
    number: string | null;
    title: string | null;
    kind: VolumeKind;
    group?: string | null;
};

const TRACK = 'rgba(255, 255, 255, 0.3)';
const FILL = 'var(--mantine-primary-color-filled)';

/** Où en est la personne dans ce tome (bulle d'un segment). */
const shareLabel = (volume: Volume, share: number) =>
    volume.progress?.completed
        ? 'Lu'
        : share > 0
          ? `Lu à ${Math.round(share * 100)} %`
          : 'Pas commencé';

/**
 * Progression dans la série, au-dessus de la barre du bas du lecteur :
 * « Tome 5 · 5 / 10 · série lue à 43 % », puis un segment par tome (lus
 * pleins, celui en cours jusqu'à la page, les autres vides). Un toucher sur
 * un segment montre son tome et « Ouvrir ». Au-delà de 40 tomes, une barre
 * continue. Dans le sens de lecture : de droite à gauche pour un manga.
 */
export const SeriesProgress = ({
    volumes,
    currentId,
    page,
    rtl,
    onOpen,
}: {
    volumes: Volume[];
    currentId: number;
    /** Page affichée du tome ouvert (à partir de 0). */
    page: number;
    rtl: boolean;
    onOpen: (volumeId: number) => void;
}) => {
    const [chosen, setChosen] = useState<number | null>(null);
    const index = volumes.findIndex((v) => v.id === currentId);
    if (index === -1 || volumes.length < 2) return null;
    const current = { id: currentId, page };
    const percent = seriesPercent(volumes, current);
    const segmented = volumes.length <= MAX_SEGMENTS;

    return (
        <Stack gap={4} data-testid="series-progress">
            <Text
                size="xs"
                c="rgba(255, 255, 255, 0.8)"
                ta="center"
                style={{ fontVariantNumeric: 'tabular-nums' }}
            >
                {volumeLabel(volumes[index]!)} · {index + 1} / {volumes.length}{' '}
                · série lue à {percent} %
            </Text>
            {segmented ? (
                <Box
                    style={{
                        display: 'flex',
                        flexDirection: rtl ? 'row-reverse' : 'row',
                        gap: 4,
                    }}
                >
                    {volumes.map((volume) => {
                        const share = volumeShare(volume, current);
                        const isCurrent = volume.id === currentId;
                        return (
                            <Popover
                                key={volume.id}
                                opened={chosen === volume.id}
                                onChange={(opened) =>
                                    setChosen(opened ? volume.id : null)
                                }
                                position="top"
                                withArrow
                                shadow="md"
                            >
                                <Popover.Target>
                                    <UnstyledButton
                                        aria-label={`${volumeLabel(volume)} : ${shareLabel(volume, share)}`}
                                        aria-current={
                                            isCurrent ? 'true' : undefined
                                        }
                                        onClick={() =>
                                            setChosen(
                                                chosen === volume.id
                                                    ? null
                                                    : volume.id,
                                            )
                                        }
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
                                            // Assez haut pour le doigt.
                                            padding: '7px 0',
                                        }}
                                    >
                                        <Box
                                            h={isCurrent ? 7 : 5}
                                            style={{
                                                borderRadius: 3,
                                                background: TRACK,
                                                overflow: 'hidden',
                                                display: 'flex',
                                                justifyContent: rtl
                                                    ? 'flex-end'
                                                    : 'flex-start',
                                                outline: isCurrent
                                                    ? '1px solid rgba(255, 255, 255, 0.85)'
                                                    : undefined,
                                            }}
                                        >
                                            <Box
                                                h="100%"
                                                w={`${share * 100}%`}
                                                bg={FILL}
                                            />
                                        </Box>
                                    </UnstyledButton>
                                </Popover.Target>
                                <Popover.Dropdown>
                                    <Stack gap={6} align="flex-start">
                                        <div>
                                            <Text size="sm" fw={500}>
                                                {volumeLabel(volume)}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {isCurrent
                                                    ? 'Tome ouvert'
                                                    : shareLabel(volume, share)}
                                            </Text>
                                        </div>
                                        {!isCurrent && (
                                            <Button
                                                size="compact-sm"
                                                onClick={() => {
                                                    setChosen(null);
                                                    onOpen(volume.id);
                                                }}
                                            >
                                                Ouvrir
                                            </Button>
                                        )}
                                    </Stack>
                                </Popover.Dropdown>
                            </Popover>
                        );
                    })}
                </Box>
            ) : (
                // Trop de tomes pour des segments : la part lue de la série,
                // et un repère sur le tome ouvert.
                <Group
                    py={7}
                    pos="relative"
                    aria-label={`Tome ${index + 1} sur ${volumes.length}`}
                >
                    <Box
                        h={5}
                        w="100%"
                        style={{
                            borderRadius: 3,
                            background: TRACK,
                            overflow: 'hidden',
                            display: 'flex',
                            justifyContent: rtl ? 'flex-end' : 'flex-start',
                        }}
                    >
                        <Box h="100%" w={`${percent}%`} bg={FILL} />
                    </Box>
                    <Box
                        pos="absolute"
                        top={3}
                        w={3}
                        h={13}
                        bg="white"
                        style={{
                            borderRadius: 2,
                            [rtl ? 'right' : 'left']:
                                `calc(${((index + 0.5) / volumes.length) * 100}% - 1px)`,
                        }}
                    />
                </Group>
            )}
        </Stack>
    );
};
