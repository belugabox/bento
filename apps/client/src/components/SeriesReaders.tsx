import {
    Avatar,
    Group,
    Popover,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';

import { UserAvatar } from '@/components/accounts/UserAvatar';
import { fetchSeriesReaders } from '@/services/api';
import { useQuery } from '@/services/useQuery';

const progressLabel = (percent: number) =>
    percent === 100 ? 'Tout lu' : `${percent} % lu`;

/**
 * « Lu par » : les avatars des autres comptes qui ont lu assez de la série
 * (seuil dans les réglages), les plus avancés d'abord ; au clic, le nom et
 * l'avancement de chacun. Rien sans eux.
 */
export const SeriesReaders = ({ seriesId }: { seriesId: number }) => {
    const { data: readers } = useQuery(
        () => fetchSeriesReaders(seriesId),
        [seriesId],
    );
    if (!readers?.length) return null;
    return (
        <Popover position="bottom-end" withArrow shadow="md">
            <Popover.Target>
                <UnstyledButton aria-label="Lu par">
                    <Group gap="xs" wrap="nowrap">
                        <Text size="sm" c="dimmed">
                            Lu par
                        </Text>
                        <Avatar.Group spacing="xs">
                            {readers.map((reader) => (
                                <UserAvatar
                                    key={reader.id}
                                    name={reader.name}
                                    seed={reader.avatarSeed}
                                    size="md"
                                />
                            ))}
                        </Avatar.Group>
                    </Group>
                </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap="xs">
                    {readers.map((reader) => (
                        <Group key={reader.id} gap="sm" wrap="nowrap">
                            <UserAvatar
                                name={reader.name}
                                seed={reader.avatarSeed}
                                size="sm"
                            />
                            <div>
                                <Text size="sm" fw={500}>
                                    {reader.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {progressLabel(reader.percent)}
                                </Text>
                            </div>
                        </Group>
                    ))}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
