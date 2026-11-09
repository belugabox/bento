import {
    Avatar,
    Button,
    CheckIcon,
    ColorSwatch,
    Group,
    Input,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Tabs,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconDice5 } from '@tabler/icons-react';
import { type ReactNode, useEffect, useState } from 'react';

import {
    AVATAR_BACKGROUNDS,
    AVATAR_BODY_COLORS,
    AVATAR_MOTIONS,
    AVATAR_VARIANTS,
    type AvatarChoice,
    formatAvatar,
    parseAvatar,
} from '@server/types';

import { avatarUrl, fetchAvatarChoice, randomAvatarSeed } from '@/services/api';

const IDEAS = 12;

const ideas = () => Array.from({ length: IDEAS }, () => randomAvatarSeed());

type Part = keyof typeof AVATAR_VARIANTS;

/** Onglets des parties, avec « Sans » pour celles qui sont facultatives. */
const PARTS: { part: Part; label: string; optional?: boolean }[] = [
    { part: 'body', label: 'Corps' },
    { part: 'top', label: 'Tête', optional: true },
    { part: 'pattern', label: 'Motif', optional: true },
    { part: 'eyes', label: 'Yeux' },
    { part: 'mouth', label: 'Bouche' },
];

const MOTION_LABELS: Record<AvatarChoice['motion'], string> = {
    none: 'Immobile',
    slow: 'Lent',
    medium: 'Normal',
    fast: 'Rapide',
};

/** Avatar à prendre d'un clic, entouré quand c'est le choix actuel. */
const Choice = ({
    seed,
    label,
    selected,
    onPick,
}: {
    seed: string;
    label: string;
    selected: boolean;
    onPick: () => void;
}) => (
    <UnstyledButton
        aria-label={label}
        aria-pressed={selected}
        onClick={onPick}
        style={{
            borderRadius: '50%',
            justifySelf: 'center',
            outline: selected
                ? '3px solid var(--mantine-primary-color-filled)'
                : undefined,
            outlineOffset: 2,
        }}
    >
        <Avatar src={avatarUrl(seed)} size={52} radius="xl" alt="" />
    </UnstyledButton>
);

const Grid = ({ children }: { children: ReactNode }) => (
    <SimpleGrid cols={{ base: 5, xs: 6 }} spacing={8} verticalSpacing={10}>
        {children}
    </SimpleGrid>
);

const Swatches = ({
    label,
    colors,
    value,
    onPick,
}: {
    label: string;
    colors: readonly string[];
    value: string;
    onPick: (color: string) => void;
}) => (
    <Stack gap={6}>
        <Text size="sm" fw={500}>
            {label}
        </Text>
        <Group gap={8}>
            {colors.map((color) => (
                <ColorSwatch
                    key={color}
                    component="button"
                    type="button"
                    color={`#${color}`}
                    size={30}
                    aria-label={`${label} : #${color}`}
                    aria-pressed={color === value}
                    onClick={() => onPick(color)}
                    style={{ cursor: 'pointer', color: '#fff' }}
                >
                    {color === value && <CheckIcon width={12} />}
                </ColorSwatch>
            ))}
        </Group>
    </Stack>
);

/**
 * Choix de l'avatar Clay : l'avatar en grand, des idées au hasard, et un
 * onglet par partie (corps, tête, motif, yeux, bouche), couleurs et
 * mouvement, chaque choix montré sur l'avatar lui-même.
 */
export const AvatarPicker = ({
    value,
    onChange,
}: {
    value: string;
    onChange: (seed: string) => void;
}) => {
    const [suggestions, setSuggestions] = useState(ideas);
    const [tab, setTab] = useState<string | null>('ideas');
    // Parties tirées par une graine (comptes d'avant), lues par le serveur.
    const [seedChoice, setSeedChoice] = useState<{
        seed: string;
        choice: AvatarChoice;
    }>();
    const composed = parseAvatar(value);
    const choice =
        composed ??
        (seedChoice?.seed === value ? seedChoice.choice : undefined);

    useEffect(() => {
        if (parseAvatar(value)) return;
        let active = true;
        fetchAvatarChoice(value)
            .then((found) => {
                if (active)
                    setSeedChoice({
                        seed: value,
                        choice: found as AvatarChoice,
                    });
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [value]);

    const change = (changes: Partial<AvatarChoice>) => {
        if (choice) onChange(formatAvatar({ ...choice, ...changes }));
    };
    // Vignettes immobiles : seul l'onglet Mouvement fait bouger.
    const still = (changes: Partial<AvatarChoice>) =>
        choice && formatAvatar({ ...choice, motion: 'none', ...changes });

    return (
        <Input.Wrapper label="Avatar">
            <Stack gap="sm" mt={4}>
                <Group align="center" gap="md">
                    <Avatar
                        src={avatarUrl(value)}
                        size={112}
                        radius={56}
                        alt="Avatar choisi"
                    />
                    <Stack gap={6} align="flex-start">
                        <Button
                            variant="light"
                            leftSection={<IconDice5 size={16} />}
                            onClick={() => onChange(randomAvatarSeed())}
                        >
                            Au hasard
                        </Button>
                        <Text size="xs" c="dimmed" maw={220}>
                            Pars d’une idée, puis change ce que tu veux dans les
                            onglets.
                        </Text>
                    </Stack>
                </Group>

                <Tabs value={tab} onChange={setTab} variant="pills">
                    <Tabs.List mb="sm">
                        <Tabs.Tab value="ideas">Idées</Tabs.Tab>
                        {PARTS.map(({ part, label }) => (
                            <Tabs.Tab
                                key={part}
                                value={part}
                                disabled={!choice}
                            >
                                {label}
                            </Tabs.Tab>
                        ))}
                        <Tabs.Tab value="colors" disabled={!choice}>
                            Couleurs
                        </Tabs.Tab>
                        <Tabs.Tab value="motion" disabled={!choice}>
                            Mouvement
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="ideas">
                        <Stack gap="xs">
                            <Grid>
                                {suggestions.map((seed, index) => (
                                    <Choice
                                        key={seed}
                                        seed={seed}
                                        label={`Idée ${index + 1}`}
                                        selected={seed === value}
                                        onPick={() => onChange(seed)}
                                    />
                                ))}
                            </Grid>
                            <Group>
                                <Button
                                    size="compact-sm"
                                    variant="subtle"
                                    leftSection={<IconDice5 size={14} />}
                                    onClick={() => setSuggestions(ideas())}
                                >
                                    Autres idées
                                </Button>
                            </Group>
                        </Stack>
                    </Tabs.Panel>

                    {choice &&
                        PARTS.map(({ part, label, optional }) => (
                            <Tabs.Panel key={part} value={part}>
                                <Grid>
                                    {optional && (
                                        <Choice
                                            seed={still({ [part]: null })!}
                                            label={`${label} : sans`}
                                            selected={choice[part] === null}
                                            onPick={() =>
                                                change({ [part]: null })
                                            }
                                        />
                                    )}
                                    {AVATAR_VARIANTS[part].map(
                                        (variant, index) => (
                                            <Choice
                                                key={variant}
                                                seed={still({
                                                    [part]: variant,
                                                })!}
                                                label={`${label} ${index + 1}`}
                                                selected={
                                                    choice[part] === variant
                                                }
                                                onPick={() =>
                                                    change({ [part]: variant })
                                                }
                                            />
                                        ),
                                    )}
                                </Grid>
                            </Tabs.Panel>
                        ))}

                    {choice && (
                        <Tabs.Panel value="colors">
                            <Stack gap="md">
                                <Swatches
                                    label="Corps"
                                    colors={AVATAR_BODY_COLORS}
                                    value={choice.bodyColor}
                                    onPick={(color) =>
                                        change({
                                            bodyColor:
                                                color as AvatarChoice['bodyColor'],
                                        })
                                    }
                                />
                                <Swatches
                                    label="Tête et motif"
                                    colors={AVATAR_BODY_COLORS}
                                    value={choice.accentColor}
                                    onPick={(color) =>
                                        change({
                                            accentColor:
                                                color as AvatarChoice['accentColor'],
                                        })
                                    }
                                />
                                <Swatches
                                    label="Fond"
                                    colors={AVATAR_BACKGROUNDS}
                                    value={choice.background}
                                    onPick={(color) =>
                                        change({
                                            background:
                                                color as AvatarChoice['background'],
                                        })
                                    }
                                />
                            </Stack>
                        </Tabs.Panel>
                    )}

                    {choice && (
                        <Tabs.Panel value="motion">
                            <Stack gap="xs">
                                <SegmentedControl
                                    aria-label="Mouvement"
                                    value={choice.motion}
                                    onChange={(motion) =>
                                        change({
                                            motion: motion as AvatarChoice['motion'],
                                        })
                                    }
                                    data={AVATAR_MOTIONS.map((motion) => ({
                                        value: motion,
                                        label: MOTION_LABELS[motion],
                                    }))}
                                />
                                <Text size="xs" c="dimmed">
                                    L’avatar se dandine partout dans Bento, sauf
                                    sur les appareils réglés pour réduire les
                                    animations.
                                </Text>
                            </Stack>
                        </Tabs.Panel>
                    )}
                </Tabs>
            </Stack>
        </Input.Wrapper>
    );
};
