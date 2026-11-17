import { Badge, Box, Button, Popover, Stack, Text } from '@mantine/core';
import { IconDatabase, IconEye } from '@tabler/icons-react';

import { useAppModes } from '@/components/appMode';
import { switchView } from '@/components/switchView';
import { stopPreview } from '@/services/api';

/**
 * Pastilles de l'en-tête, à côté du logo : vue lecteur d'un admin, copie
 * de la prod. Sur téléphone, l'icône seule ; un toucher ouvre
 * l'explication (et « Revenir à la vue admin »). Remplacent les bandeaux,
 * qui poussaient toute la page (demandé).
 */
export const ModeBadges = () => {
    const modes = useAppModes();
    return modes.map((mode) => (
        <Popover key={mode.key} position="bottom-start" withArrow shadow="md">
            <Popover.Target>
                <Badge
                    component="button"
                    color={mode.color}
                    variant="light"
                    size="lg"
                    radius="sm"
                    aria-label={mode.label}
                    title={mode.label}
                    leftSection={
                        mode.key === 'preview' ? (
                            <IconEye size={14} />
                        ) : (
                            <IconDatabase size={14} />
                        )
                    }
                    style={{ cursor: 'pointer', flexShrink: 0 }}
                    px={{ base: 6, sm: 10 }}
                >
                    <Box component="span" visibleFrom="sm">
                        {mode.label}
                    </Box>
                </Badge>
            </Popover.Target>
            <Popover.Dropdown maw={300}>
                <Stack gap="sm">
                    <Text size="sm" fw={600}>
                        {mode.label}
                    </Text>
                    <Text size="sm">{mode.detail}</Text>
                    {mode.key === 'preview' && (
                        <Button
                            size="xs"
                            variant="light"
                            color="orange"
                            onClick={() => void switchView(stopPreview)}
                        >
                            Revenir à la vue admin
                        </Button>
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    ));
};

/**
 * Liseré de 3 px en haut de l'écran, sur toutes les pages (lecteur
 * compris), dans la couleur du mode le plus important.
 */
export const ModeLine = () => {
    const [mode] = useAppModes();
    if (!mode) return null;
    return (
        <Box
            aria-hidden
            pos="fixed"
            top={0}
            left={0}
            right={0}
            h={3}
            bg={`var(--mantine-color-${mode.color}-6)`}
            style={{ zIndex: 1000, pointerEvents: 'none' }}
        />
    );
};
