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
    caption,
    subtitle,
    progress,
    corner,
    menu,
    dimmed = false,
    highlighted = false,
}: {
    to: string;
    /** Adresse de l'image de couverture. */
    cover: string | null;
    title: string;
    /**
     * Ligne sous le titre (titre d'un tome), coupée par « … ». Une chaîne
     * vide garde la place : les vignettes d'une grille restent alignées.
     */
    caption?: string;
    subtitle?: string;
    /** Avancement de lecture (0 à 1), en barre sous la couverture. */
    progress?: number;
    /** Contenu en haut à droite de la couverture (badge, bouton). */
    corner?: ReactNode;
    /** Menu d'actions (⋮), en bas à droite, à côté du titre. */
    menu?: ReactNode;
    /** Grisée (série déjà lue). */
    dimmed?: boolean;
    /** Contour de couleur (tome à reprendre). */
    highlighted?: boolean;
}) => (
    // Le coin est hors du lien : un bouton ne peut pas être dans un lien.
    <Box pos="relative" style={dimmed ? { opacity: 0.5 } : undefined}>
        <Card
            component={Link}
            to={to}
            padding={0}
            radius="md"
            withBorder
            style={
                highlighted
                    ? {
                          borderColor: 'var(--mantine-primary-color-filled)',
                          borderWidth: 2,
                      }
                    : undefined
            }
        >
            <Box pos="relative">
                <AspectRatio ratio={2 / 3}>
                    {cover ? (
                        <Image
                            src={cover}
                            alt={title}
                            loading="lazy"
                            fit="cover"
                        />
                    ) : (
                        <Center
                            style={{
                                backgroundColor:
                                    'light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))',
                            }}
                        >
                            <IconBook size={32} />
                        </Center>
                    )}
                </AspectRatio>
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
            <Text
                size="sm"
                fw={500}
                lineClamp={1}
                pl="xs"
                pr={menu ? 30 : 'xs'}
                pt={6}
                title={title}
            >
                {title}
            </Text>
            {caption !== undefined && (
                <Text
                    size="xs"
                    lineClamp={1}
                    px="xs"
                    title={caption || undefined}
                >
                    {caption || ' '}
                </Text>
            )}
            {subtitle && (
                <Text
                    size="xs"
                    c="dimmed"
                    lineClamp={1}
                    pl="xs"
                    pr={menu ? 30 : 'xs'}
                    pb={6}
                >
                    {subtitle}
                </Text>
            )}
        </Card>
        {corner && (
            <Box pos="absolute" top={6} right={6}>
                {corner}
            </Box>
        )}
        {menu && (
            <Box pos="absolute" bottom={4} right={2}>
                {menu}
            </Box>
        )}
    </Box>
);
