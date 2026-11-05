import {
    AspectRatio,
    Box,
    Card,
    Center,
    Image,
    Progress,
    Text,
} from '@mantine/core';
import { IconBook } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Vignette cliquable : couverture et légende (série ou tome). */
export const CoverCard = ({
    to,
    cover,
    title,
    subtitle,
    progress,
    corner,
}: {
    to: string;
    /** Adresse de l'image de couverture. */
    cover: string | null;
    title: string;
    subtitle?: string;
    /** Avancement de lecture (0 à 1), en barre sous la couverture. */
    progress?: number;
    /** Contenu en haut à droite de la couverture (badge, bouton). */
    corner?: ReactNode;
}) => (
    <Card component={Link} to={to} padding={0} radius="md" withBorder>
        <Box pos="relative">
            <AspectRatio ratio={2 / 3}>
                {cover ? (
                    <Image src={cover} alt={title} loading="lazy" fit="cover" />
                ) : (
                    <Center bg="dark.6">
                        <IconBook size={32} />
                    </Center>
                )}
            </AspectRatio>
            {corner && (
                <Box pos="absolute" top={6} right={6}>
                    {corner}
                </Box>
            )}
            {progress !== undefined && progress > 0 && (
                <Progress
                    value={progress * 100}
                    size="sm"
                    radius={0}
                    pos="absolute"
                    bottom={0}
                    left={0}
                    right={0}
                    aria-label="Avancement"
                />
            )}
        </Box>
        <Text size="sm" fw={500} lineClamp={1} px="xs" pt={6} title={title}>
            {title}
        </Text>
        {subtitle && (
            <Text size="xs" c="dimmed" px="xs" pb={6}>
                {subtitle}
            </Text>
        )}
    </Card>
);
