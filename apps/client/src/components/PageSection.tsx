import { Anchor, Group, Stack, Text } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * Bloc de l'accueil ou de la bibliothèque, sous un titre discret (petites
 * capitales, avec le nombre) ; « Tout voir » mène à la liste complète.
 * Sans titre : le contenu seul.
 */
export const PageSection = ({
    title,
    count,
    more,
    children,
}: {
    title: string | null;
    count?: number;
    /** Adresse de « Tout voir ». */
    more?: string;
    children: ReactNode;
}) => (
    <Stack gap={8} component="section" aria-label={title ?? undefined}>
        {title && (
            <Group justify="space-between" align="baseline" wrap="nowrap">
                <Text
                    size="xs"
                    c="var(--mantine-primary-color-light-color)"
                    fw={600}
                    tt="uppercase"
                    style={{ letterSpacing: '0.08em' }}
                >
                    {title}
                    {count !== undefined && (
                        <>
                            {' '}
                            <Text span inherit c="dimmed">
                                · {count}
                            </Text>
                        </>
                    )}
                </Text>
                {more && (
                    <Anchor
                        component={Link}
                        to={more}
                        size="sm"
                        fw={500}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            flexShrink: 0,
                        }}
                        aria-label={`Tout voir : ${title}`}
                    >
                        Tout voir
                        <IconChevronRight size={14} />
                    </Anchor>
                )}
            </Group>
        )}
        {children}
    </Stack>
);
