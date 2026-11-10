import {
    Badge,
    List,
    Popover,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import type { ReactNode } from 'react';

import type { Completeness } from '@/components/completeness';

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
    short,
}: {
    completeness: Completeness;
    action?: ReactNode;
    /** « 72 % » seul (tableau des séries). */
    short?: boolean;
}) => (
    <Popover position="bottom-start" withArrow shadow="md" width={260}>
        <Popover.Target>
            <UnstyledButton aria-label={`Fiche complète à ${percent} %`}>
                <Badge variant="light" color={colorOf(percent)}>
                    {short ? `${percent} %` : `Fiche à ${percent} %`}
                </Badge>
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
                        <List size="sm" spacing={2}>
                            {missing.map((item) => (
                                <List.Item key={item}>{item}</List.Item>
                            ))}
                        </List>
                    </>
                )}
                {action}
            </Stack>
        </Popover.Dropdown>
    </Popover>
);
