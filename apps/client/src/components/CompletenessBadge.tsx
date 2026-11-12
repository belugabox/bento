import {
    Badge,
    Box,
    List,
    Popover,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { type Completeness, missingHint } from '@/components/completeness';

/** Couleur d'une complétude : verte, orange, puis rouge. */
const colorOf = (percent: number) =>
    percent === 100 ? 'green' : percent >= 60 ? 'orange' : 'red';

/**
 * Pastille « Fiche à 72 % » : un clic montre ce qui manque, et `action`
 * (lien vers l'éditeur…) en dessous.
 */
export const CompletenessBadge = ({
    completeness: { percent, missing },
    action,
    withMissing,
}: {
    completeness: Completeness;
    action?: ReactNode;
    /**
     * Ce qui manque écrit dans la bulle (« 83 % · Note, Année de 3 tomes »),
     * en casse normale (page Séries).
     */
    withMissing?: boolean;
}) => (
    <Popover position="bottom-start" withArrow shadow="md" width={260}>
        <Popover.Target>
            <UnstyledButton aria-label={`Fiche complète à ${percent} %`}>
                {withMissing ? (
                    <Box
                        px={8}
                        py={3}
                        fz="xs"
                        lh={1.4}
                        ta="left"
                        style={{
                            borderRadius: 'var(--mantine-radius-md)',
                            background: `var(--mantine-color-${colorOf(percent)}-light)`,
                            color: `var(--mantine-color-${colorOf(percent)}-light-color)`,
                            cursor: 'pointer',
                            // Les raisons passent à la ligne.
                            whiteSpace: 'normal',
                        }}
                    >
                        <Text span inherit fw={700}>
                            {percent} %
                        </Text>
                        {missing.length > 0 && ` · ${missing.join(', ')}`}
                    </Box>
                ) : (
                    <Badge
                        variant="light"
                        color={colorOf(percent)}
                        // On voit qu'elle s'ouvre (ce qui manque).
                        rightSection={
                            missing.length > 0 && <IconInfoCircle size={12} />
                        }
                        style={{ cursor: 'pointer' }}
                    >
                        {`Fiche à ${percent} %`}
                    </Badge>
                )}
            </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown>
            <Stack gap="xs">
                {missing.length === 0 ? (
                    <Text size="sm">
                        Toutes les informations sont remplies.
                    </Text>
                ) : (
                    <>
                        <Text size="sm" fw={500}>
                            À compléter
                        </Text>
                        <List size="sm" spacing={4}>
                            {missing.map((item) => (
                                <List.Item key={item}>
                                    {item}
                                    <Text size="xs" c="dimmed">
                                        {missingHint(item)}
                                    </Text>
                                </List.Item>
                            ))}
                        </List>
                    </>
                )}
                {action}
            </Stack>
        </Popover.Dropdown>
    </Popover>
);
