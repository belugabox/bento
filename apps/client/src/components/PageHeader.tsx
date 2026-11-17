import { ActionIcon, Group, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * En-tête d'une page : la flèche retour en haut à gauche (vers la page
 * parente, toujours la même), le titre, et à droite les actions de la
 * page ; une ligne d'explication dessous. Les pages des onglets (accueil,
 * bibliothèque, Moi) n'ont pas de flèche.
 */
export const PageHeader = ({
    back,
    backLabel = 'Retour',
    title,
    description,
    children,
}: {
    /** Page parente. */
    back?: string;
    backLabel?: string;
    /** Texte (titre de niveau 2) ou contenu déjà mis en forme. */
    title: ReactNode;
    description?: ReactNode;
    /** À droite du titre : boutons, choix… */
    children?: ReactNode;
}) => (
    <Stack gap={2}>
        <Group justify="space-between" gap="sm" wrap="nowrap" mih={40}>
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                {back && (
                    <ActionIcon
                        component={Link}
                        to={back}
                        variant="subtle"
                        color="gray"
                        size="lg"
                        ml={-8}
                        aria-label={backLabel}
                        title={backLabel}
                        style={{ flexShrink: 0 }}
                    >
                        <IconArrowLeft size={22} />
                    </ActionIcon>
                )}
                {typeof title === 'string' ? (
                    <Title order={2} lineClamp={1}>
                        {title}
                    </Title>
                ) : (
                    title
                )}
            </Group>
            {children}
        </Group>
        {description && (
            <Text size="sm" c="dimmed">
                {description}
            </Text>
        )}
    </Stack>
);
