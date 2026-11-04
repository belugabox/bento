import { AspectRatio, Card, Center, Image, Text } from '@mantine/core';
import { IconBook } from '@tabler/icons-react';
import { Link } from 'react-router';

import { coverUrl } from '@/services/api';

/** Vignette cliquable : couverture et légende (série ou tome). */
export const CoverCard = ({
    to,
    coverId,
    title,
    subtitle,
}: {
    to: string;
    coverId: number | null;
    title: string;
    subtitle?: string;
}) => (
    <Card component={Link} to={to} padding={0} radius="md" withBorder>
        <AspectRatio ratio={2 / 3}>
            {coverId ? (
                <Image
                    src={coverUrl(coverId)}
                    alt={title}
                    loading="lazy"
                    fit="cover"
                />
            ) : (
                <Center bg="dark.6">
                    <IconBook size={32} />
                </Center>
            )}
        </AspectRatio>
        <Text size="sm" fw={500} lineClamp={2} px="xs" pt={6} title={title}>
            {title}
        </Text>
        {subtitle && (
            <Text size="xs" c="dimmed" px="xs" pb={6}>
                {subtitle}
            </Text>
        )}
    </Card>
);
