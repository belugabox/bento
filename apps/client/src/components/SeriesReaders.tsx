import { Avatar, Group, Text, Tooltip } from '@mantine/core';

import { UserAvatar } from '@/components/accounts/UserAvatar';
import { fetchSeriesReaders } from '@/services/api';
import { useQuery } from '@/services/useQuery';

/**
 * « Lu par » : les avatars des autres comptes qui ont lu assez de la série
 * (seuil dans les réglages), les plus avancés d'abord. Rien sans eux.
 */
export const SeriesReaders = ({ seriesId }: { seriesId: number }) => {
    const { data: readers } = useQuery(
        () => fetchSeriesReaders(seriesId),
        [seriesId],
    );
    if (!readers?.length) return null;
    return (
        <Group gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed">
                Lu par
            </Text>
            <Tooltip.Group openDelay={200} closeDelay={100}>
                <Avatar.Group spacing="xs">
                    {readers.map((reader) => (
                        <Tooltip
                            key={reader.id}
                            label={`${reader.name} · ${
                                reader.percent === 100
                                    ? 'tout lu'
                                    : `${reader.percent} %`
                            }`}
                            withArrow
                        >
                            <UserAvatar
                                name={reader.name}
                                seed={reader.avatarSeed}
                                size="md"
                            />
                        </Tooltip>
                    ))}
                </Avatar.Group>
            </Tooltip.Group>
        </Group>
    );
};
