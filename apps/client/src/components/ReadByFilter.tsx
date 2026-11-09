import { Avatar, Button, Menu, Text } from '@mantine/core';
import { IconCheck, IconChevronDown, IconUsers } from '@tabler/icons-react';

import { UserAvatar } from '@/components/accounts/UserAvatar';
import type { FamilyReader } from '@/services/api';

/**
 * Filtre « Lu par » de la barre de l'accueil : une personne de la famille,
 * pour ne garder que les séries qu'elle a lues (même seuil que « Lu par »
 * sur la fiche série).
 */
export const ReadByFilter = ({
    readers,
    value,
    onChange,
}: {
    readers: FamilyReader[];
    value: number | null;
    onChange: (readerId: number | null) => void;
}) => {
    const chosen = readers.find((r) => r.id === value);
    return (
        <Menu position="top-end">
            <Menu.Target>
                <Button
                    size="compact-md"
                    radius="xl"
                    fw={400}
                    fz="sm"
                    variant={chosen ? 'filled' : 'default'}
                    aria-label="Filtrer par lecteur"
                    leftSection={
                        chosen ? (
                            <UserAvatar
                                name={chosen.name}
                                seed={chosen.avatarSeed}
                                size={20}
                            />
                        ) : (
                            <IconUsers size={16} />
                        )
                    }
                    rightSection={<IconChevronDown size={12} />}
                    style={{ flexShrink: 0 }}
                >
                    {chosen ? chosen.name : 'Lu par'}
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>Séries lues par</Menu.Label>
                <Menu.Item
                    leftSection={
                        <Avatar size={24} radius="xl">
                            <IconUsers size={14} />
                        </Avatar>
                    }
                    rightSection={!chosen && <IconCheck size={14} />}
                    onClick={() => onChange(null)}
                >
                    Tout le monde
                </Menu.Item>
                {readers.map((reader) => (
                    <Menu.Item
                        key={reader.id}
                        leftSection={
                            <UserAvatar
                                name={reader.name}
                                seed={reader.avatarSeed}
                                size={24}
                            />
                        }
                        rightSection={
                            reader.id === value ? (
                                <IconCheck size={14} />
                            ) : (
                                <Text size="xs" c="dimmed">
                                    {reader.seriesIds.length}
                                </Text>
                            )
                        }
                        onClick={() => onChange(reader.id)}
                    >
                        {reader.name}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};
