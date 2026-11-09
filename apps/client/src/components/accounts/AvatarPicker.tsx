import {
    Avatar,
    Button,
    Group,
    Input,
    SimpleGrid,
    Stack,
    UnstyledButton,
} from '@mantine/core';
import { IconDice5 } from '@tabler/icons-react';
import { useState } from 'react';

import { avatarUrl, randomAvatarSeed } from '@/services/api';

const SUGGESTIONS = 6;

const suggestions = () =>
    Array.from({ length: SUGGESTIONS }, () => randomAvatarSeed());

/**
 * Choix de l'avatar Clay : l'avatar choisi en grand, quelques idées à
 * prendre d'un clic, et un dé pour en tirer d'autres.
 */
export const AvatarPicker = ({
    value,
    onChange,
}: {
    value: string;
    onChange: (seed: string) => void;
}) => {
    const [ideas, setIdeas] = useState(suggestions);

    return (
        <Input.Wrapper label="Avatar">
            <Group align="center" wrap="nowrap" gap="md" mt={4}>
                <Avatar
                    src={avatarUrl(value)}
                    size={88}
                    radius="xl"
                    alt="Avatar choisi"
                />
                <Stack gap={6}>
                    <SimpleGrid cols={SUGGESTIONS / 2} spacing={6}>
                        {ideas.map((seed) => (
                            <UnstyledButton
                                key={seed}
                                aria-label="Prendre cet avatar"
                                onClick={() => onChange(seed)}
                            >
                                <Avatar
                                    src={avatarUrl(seed)}
                                    size={40}
                                    radius="xl"
                                    alt=""
                                />
                            </UnstyledButton>
                        ))}
                    </SimpleGrid>
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={<IconDice5 size={14} />}
                        onClick={() => {
                            setIdeas(suggestions());
                        }}
                    >
                        Autres idées
                    </Button>
                </Stack>
            </Group>
        </Input.Wrapper>
    );
};
