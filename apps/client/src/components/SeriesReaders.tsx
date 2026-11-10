import {
    Avatar,
    Group,
    Popover,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useRef, useState } from 'react';

import { UserAvatar } from '@/components/accounts/UserAvatar';
import { volumeLabel } from '@/components/readingStatus';
import { type SeriesReader, fetchSeriesReaders } from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Où en est la personne : son dernier tome ouvert, et la page atteinte. */
const positionLabel = ({ current }: SeriesReader) =>
    current &&
    `${volumeLabel(current)}${
        current.completed
            ? ' lu'
            : `, page ${current.page} sur ${current.pageCount}`
    }`;

const progressLabel = (percent: number) =>
    percent === 100 ? 'Toute la série lue' : `${percent} % de la série`;

// Délai avant de fermer, le temps de passer de la cible au détail.
const CLOSE_MS = 150;

/**
 * « Lu par » : les avatars des autres comptes qui ont lu assez de la série
 * (seuil dans les réglages), les plus avancés d'abord ; au survol, au clic
 * ou au toucher, le nom et l'avancement de chacun. Rien sans eux.
 */
export const SeriesReaders = ({ seriesId }: { seriesId: number }) => {
    const { data: readers } = useQuery(
        () => fetchSeriesReaders(seriesId),
        [seriesId],
    );
    const [opened, setOpened] = useState(false);
    const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
    // Souris : le survol ouvre, et un clic garde ouvert. Doigt ou clavier :
    // le clic ouvre et ferme.
    const pointer = useRef('');
    const hover = (enter: boolean) => (event: React.PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        clearTimeout(closing.current);
        if (enter) setOpened(true);
        else closing.current = setTimeout(() => setOpened(false), CLOSE_MS);
    };
    if (!readers?.length) return null;
    return (
        <Popover
            position="bottom-end"
            withArrow
            shadow="md"
            opened={opened}
            onChange={setOpened}
        >
            <Popover.Target>
                <UnstyledButton
                    aria-label="Lu par"
                    aria-expanded={opened}
                    onPointerDown={(event) => {
                        pointer.current = event.pointerType;
                    }}
                    onPointerEnter={hover(true)}
                    onPointerLeave={hover(false)}
                    onClick={() => {
                        const mouse = pointer.current === 'mouse';
                        pointer.current = '';
                        setOpened((open) => mouse || !open);
                    }}
                >
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
            <Popover.Dropdown
                onPointerEnter={hover(true)}
                onPointerLeave={hover(false)}
            >
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
                                {reader.percent < 100 &&
                                    positionLabel(reader) && (
                                        <Text size="xs">
                                            {positionLabel(reader)}
                                        </Text>
                                    )}
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
