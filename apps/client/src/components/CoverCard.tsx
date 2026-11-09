import {
    AspectRatio,
    Box,
    Card,
    Center,
    Group,
    Image,
    Progress,
    Stack,
    Text,
} from '@mantine/core';
import { IconBook } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Couverture au format d'un livre, ou une icône à défaut. */
const Cover = ({
    cover,
    title,
    iconSize,
}: {
    cover: string | null;
    title: string;
    iconSize: number;
}) => (
    <AspectRatio ratio={2 / 3}>
        {cover ? (
            <Image src={cover} alt={title} loading="lazy" fit="cover" />
        ) : (
            <Center
                style={{
                    backgroundColor:
                        'light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))',
                }}
            >
                <IconBook size={iconSize} />
            </Center>
        )}
    </AspectRatio>
);

/**
 * Vignette cliquable : couverture et légende (série ou tome). En ligne
 * (`layout="row"`), une petite couverture à gauche du texte.
 */
export const CoverCard = ({
    to,
    cover,
    title,
    caption,
    subtitle,
    progress,
    corner,
    badge,
    menu,
    dimmed = false,
    layout = 'card',
    coversOnly = false,
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
    /** Bouton en haut à droite de la couverture, hors du lien. */
    corner?: ReactNode;
    /**
     * Icône d'état en haut à droite (à reprendre, lue, à lire) : dans le
     * lien, un clic dessus ouvre la carte.
     */
    badge?: ReactNode;
    /** Menu d'actions (⋮), en bas à droite, à côté du titre. */
    menu?: ReactNode;
    /** Grisée (série déjà lue). */
    dimmed?: boolean;
    layout?: 'card' | 'row';
    /** Sans titre ni légende sous la couverture (grille). */
    coversOnly?: boolean;
}) => {
    const shown = progress !== undefined && progress > 0;
    if (layout === 'row') {
        return (
            <Box pos="relative" style={dimmed ? { opacity: 0.5 } : undefined}>
                <Card
                    component={Link}
                    to={to}
                    padding={6}
                    radius="md"
                    withBorder
                >
                    <Group gap="sm" wrap="nowrap" pr={menu ? 32 : 0}>
                        <Box w={44} style={{ flexShrink: 0 }}>
                            <Cover cover={cover} title={title} iconSize={20} />
                        </Box>
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" fw={500} lineClamp={1}>
                                {title}
                            </Text>
                            {caption && (
                                <Text size="xs" lineClamp={1}>
                                    {caption}
                                </Text>
                            )}
                            {subtitle && (
                                <Text size="xs" c="dimmed" lineClamp={1}>
                                    {subtitle}
                                </Text>
                            )}
                            {shown && (
                                <Progress
                                    value={progress * 100}
                                    size="xs"
                                    maw={200}
                                    aria-label="Avancement"
                                />
                            )}
                        </Stack>
                        {badge && <Box style={{ flexShrink: 0 }}>{badge}</Box>}
                    </Group>
                </Card>
                {corner && (
                    <Box
                        pos="absolute"
                        top="50%"
                        right={menu ? 36 : 8}
                        style={{ transform: 'translateY(-50%)' }}
                    >
                        {corner}
                    </Box>
                )}
                {menu && (
                    <Box
                        pos="absolute"
                        top="50%"
                        right={4}
                        style={{ transform: 'translateY(-50%)' }}
                    >
                        {menu}
                    </Box>
                )}
            </Box>
        );
    }
    return (
        // Le coin est hors du lien : un bouton ne peut pas être dans un lien.
        <Box pos="relative" style={dimmed ? { opacity: 0.5 } : undefined}>
            <Card component={Link} to={to} padding={0} radius="md" withBorder>
                <Box pos="relative">
                    <Cover cover={cover} title={title} iconSize={32} />
                    {shown && (
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
                    {badge && (
                        <Box pos="absolute" top={6} right={6}>
                            {badge}
                        </Box>
                    )}
                </Box>
                {!coversOnly && (
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
                )}
                {!coversOnly && caption !== undefined && (
                    <Text
                        size="xs"
                        lineClamp={1}
                        px="xs"
                        title={caption || undefined}
                    >
                        {caption || ' '}
                    </Text>
                )}
                {!coversOnly && subtitle && (
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
            {menu &&
                (coversOnly ? (
                    // Sur la couverture : un fond pour rester lisible.
                    <Box
                        pos="absolute"
                        bottom={8}
                        right={4}
                        style={{
                            borderRadius: 'var(--mantine-radius-sm)',
                            background: 'rgba(0, 0, 0, 0.5)',
                        }}
                    >
                        {menu}
                    </Box>
                ) : (
                    <Box pos="absolute" bottom={4} right={2}>
                        {menu}
                    </Box>
                ))}
        </Box>
    );
};
