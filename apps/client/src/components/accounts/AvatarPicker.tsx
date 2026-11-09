import {
    Avatar,
    Button,
    CheckIcon,
    ColorSwatch,
    Group,
    Input,
    Stack,
    Tabs,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconArrowRight, IconDice5 } from '@tabler/icons-react';
import { type ReactNode, useEffect, useState } from 'react';

import {
    AVATAR_BACKGROUNDS,
    AVATAR_BODY_COLORS,
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

/** Onglets, de haut en bas. */
const TABS: { value: string; label: string }[] = [
    { value: 'ideas', label: 'Idées' },
    ...PARTS.map(({ part, label }) => ({ value: part, label })),
    { value: 'colors', label: 'Couleurs' },
];

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
            outline: selected
                ? '3px solid var(--mantine-primary-color-filled)'
                : undefined,
            outlineOffset: 2,
        }}
    >
        <Avatar src={avatarUrl(seed)} size={52} radius="xl" alt="" />
    </UnstyledButton>
);

/** Propositions, autant par ligne que la largeur le permet. */
const Grid = ({ children }: { children: ReactNode }) => (
    <Group gap={10}>{children}</Group>
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
 * Choix de l'avatar Clay : l'avatar en grand, puis des onglets de haut en
 * bas (idées au hasard, une partie par onglet, couleurs) avec le choix à
 * droite, chaque proposition montrée sur l'avatar lui-même, et « Suivant »
 * pour passer à l'onglet d'après.
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
    const variant = (current: AvatarChoice, changes: Partial<AvatarChoice>) =>
        formatAvatar({ ...current, ...changes });

    /** « Suivant » : l'onglet d'après, s'il y en a un. */
    const next = (current: string) => {
        const following = TABS[TABS.findIndex((t) => t.value === current) + 1];
        return (
            following && (
                <Button
                    size="compact-sm"
                    variant="light"
                    rightSection={<IconArrowRight size={14} />}
                    disabled={!choice}
                    onClick={() => setTab(following.value)}
                >
                    Suivant
                </Button>
            )
        );
    };

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

                <Tabs
                    value={tab}
                    onChange={setTab}
                    variant="pills"
                    orientation="vertical"
                >
                    <Tabs.List>
                        {TABS.map((item) => (
                            <Tabs.Tab
                                key={item.value}
                                value={item.value}
                                disabled={item.value !== 'ideas' && !choice}
                            >
                                {item.label}
                            </Tabs.Tab>
                        ))}
                    </Tabs.List>

                    <Tabs.Panel value="ideas" pl="sm">
                        <Stack gap="sm">
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
                            <Group justify="space-between" gap="xs">
                                <Button
                                    size="compact-sm"
                                    variant="subtle"
                                    leftSection={<IconDice5 size={14} />}
                                    onClick={() => setSuggestions(ideas())}
                                >
                                    Autres idées
                                </Button>
                                {next('ideas')}
                            </Group>
                        </Stack>
                    </Tabs.Panel>

                    {choice &&
                        PARTS.map(({ part, label, optional }) => (
                            <Tabs.Panel key={part} value={part} pl="sm">
                                <Stack gap="sm">
                                    <Grid>
                                        {optional && (
                                            <Choice
                                                seed={variant(choice, {
                                                    [part]: null,
                                                })}
                                                label={`${label} : sans`}
                                                selected={choice[part] === null}
                                                onPick={() =>
                                                    change({ [part]: null })
                                                }
                                            />
                                        )}
                                        {AVATAR_VARIANTS[part].map(
                                            (name, index) => (
                                                <Choice
                                                    key={name}
                                                    seed={variant(choice, {
                                                        [part]: name,
                                                    })}
                                                    label={`${label} ${index + 1}`}
                                                    selected={
                                                        choice[part] === name
                                                    }
                                                    onPick={() =>
                                                        change({ [part]: name })
                                                    }
                                                />
                                            ),
                                        )}
                                    </Grid>
                                    <Group justify="flex-end">
                                        {next(part)}
                                    </Group>
                                </Stack>
                            </Tabs.Panel>
                        ))}

                    {choice && (
                        <Tabs.Panel value="colors" pl="sm">
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
                                    label="Détails"
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
                </Tabs>
            </Stack>
        </Input.Wrapper>
    );
};
