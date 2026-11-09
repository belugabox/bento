import {
    Accordion,
    Avatar,
    Button,
    CheckIcon,
    ColorSwatch,
    Group,
    Input,
    SimpleGrid,
    Stack,
    Tabs,
    Text,
    UnstyledButton,
} from '@mantine/core';
import {
    IconAdjustments,
    IconArrowRight,
    IconDice5,
} from '@tabler/icons-react';
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

// Idées à côté de l'avatar : deux lignes de trois.
const IDEAS = 6;
const IDEA_SIZE = 40;
// Propositions de « Personnaliser » : trois par ligne sur un téléphone.
const PART_SIZE = 46;

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

/** Onglets de « Personnaliser », de haut en bas. */
const TABS: { value: string; label: string }[] = [
    ...PARTS.map(({ part, label }) => ({ value: part, label })),
    { value: 'colors', label: 'Couleurs' },
];

/** Avatar à prendre d'un clic, entouré quand c'est le choix actuel. */
const Choice = ({
    seed,
    label,
    selected,
    onPick,
    size = 52,
}: {
    seed: string;
    label: string;
    selected: boolean;
    onPick: () => void;
    size?: number;
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
        <Avatar src={avatarUrl(seed)} size={size} radius="xl" alt="" />
    </UnstyledButton>
);

/** Propositions, autant par ligne que la largeur le permet. */
const Grid = ({ children }: { children: ReactNode }) => (
    <Group gap={8}>{children}</Group>
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
 * Choix de l'avatar Clay : l'avatar en grand, à côté des idées à prendre
 * d'un clic, puis « Personnaliser », fermé au départ : un onglet par partie
 * et les couleurs, de haut en bas, le choix à droite, chaque proposition
 * montrée sur l'avatar lui-même, et « Suivant » pour l'onglet d'après.
 */
export const AvatarPicker = ({
    value,
    onChange,
    label = 'Avatar',
}: {
    value: string;
    onChange: (seed: string) => void;
    /** Sans titre quand la section en a déjà un (« Mon compte »). */
    label?: string | null;
}) => {
    const [suggestions, setSuggestions] = useState(ideas);
    const [tab, setTab] = useState<string | null>(TABS[0]!.value);
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
                <Group justify="flex-end">
                    <Button
                        size="compact-sm"
                        variant="light"
                        rightSection={<IconArrowRight size={14} />}
                        onClick={() => setTab(following.value)}
                    >
                        Suivant
                    </Button>
                </Group>
            )
        );
    };

    return (
        <Input.Wrapper label={label}>
            <Stack gap="sm" mt={4}>
                <Group align="center" gap="lg" wrap="nowrap">
                    <Avatar
                        src={avatarUrl(value)}
                        size={112}
                        radius={56}
                        alt="Avatar choisi"
                        style={{ flexShrink: 0 }}
                    />
                    <Stack gap={8} style={{ minWidth: 0 }}>
                        <Text size="xs" c="dimmed">
                            Des idées ? Touche celle qui te plaît.
                        </Text>
                        <SimpleGrid
                            cols={IDEAS / 2}
                            spacing={8}
                            verticalSpacing={8}
                            w={(IDEAS / 2) * IDEA_SIZE + (IDEAS / 2 - 1) * 8}
                        >
                            {suggestions.map((seed, index) => (
                                <Choice
                                    key={seed}
                                    seed={seed}
                                    size={IDEA_SIZE}
                                    label={`Idée ${index + 1}`}
                                    selected={seed === value}
                                    onPick={() => onChange(seed)}
                                />
                            ))}
                        </SimpleGrid>
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
                </Group>

                <Accordion
                    variant="contained"
                    radius="md"
                    styles={{
                        content: { padding: 'var(--mantine-spacing-xs)' },
                    }}
                >
                    <Accordion.Item value="edit">
                        <Accordion.Control
                            icon={<IconAdjustments size={18} />}
                            disabled={!choice}
                        >
                            Personnaliser
                        </Accordion.Control>
                        <Accordion.Panel>
                            {choice && (
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
                                            >
                                                {item.label}
                                            </Tabs.Tab>
                                        ))}
                                    </Tabs.List>

                                    {PARTS.map(({ part, label, optional }) => (
                                        <Tabs.Panel
                                            key={part}
                                            value={part}
                                            pl="sm"
                                        >
                                            <Stack gap="sm">
                                                <Grid>
                                                    {optional && (
                                                        <Choice
                                                            seed={variant(
                                                                choice,
                                                                {
                                                                    [part]: null,
                                                                },
                                                            )}
                                                            size={PART_SIZE}
                                                            label={`${label} : sans`}
                                                            selected={
                                                                choice[part] ===
                                                                null
                                                            }
                                                            onPick={() =>
                                                                change({
                                                                    [part]: null,
                                                                })
                                                            }
                                                        />
                                                    )}
                                                    {AVATAR_VARIANTS[part].map(
                                                        (name, index) => (
                                                            <Choice
                                                                key={name}
                                                                seed={variant(
                                                                    choice,
                                                                    {
                                                                        [part]: name,
                                                                    },
                                                                )}
                                                                size={PART_SIZE}
                                                                label={`${label} ${index + 1}`}
                                                                selected={
                                                                    choice[
                                                                        part
                                                                    ] === name
                                                                }
                                                                onPick={() =>
                                                                    change({
                                                                        [part]: name,
                                                                    })
                                                                }
                                                            />
                                                        ),
                                                    )}
                                                </Grid>
                                                {next(part)}
                                            </Stack>
                                        </Tabs.Panel>
                                    ))}

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
                                </Tabs>
                            )}
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            </Stack>
        </Input.Wrapper>
    );
};
