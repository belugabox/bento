import {
    CheckIcon,
    ColorSwatch,
    Group,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';

import {
    ACCENTS,
    type Accent,
    COLOR_SCHEME_OPTIONS,
    type ColorScheme,
} from './theme';

/** Choix du mode : clair, sombre ou selon le système. */
export const ColorSchemeControl = ({
    value,
    onChange,
}: {
    value: ColorScheme;
    onChange: (value: ColorScheme) => void;
}) => (
    <Stack gap={6}>
        <Text size="sm" fw={500}>
            Mode
        </Text>
        <SegmentedControl
            fullWidth
            value={value}
            onChange={(next) => onChange(next as ColorScheme)}
            data={COLOR_SCHEME_OPTIONS}
        />
    </Stack>
);

/** Choix de la couleur d'accent, en pastilles. */
export const AccentPicker = ({
    value,
    onChange,
}: {
    value: Accent;
    onChange: (value: Accent) => void;
}) => (
    <Stack gap={6}>
        <Text size="sm" fw={500}>
            Couleur
        </Text>
        <Group gap="xs">
            {ACCENTS.map((option) => (
                <Tooltip key={option.value} label={option.label}>
                    <UnstyledButton
                        aria-label={option.label}
                        aria-pressed={value === option.value}
                        onClick={() => onChange(option.value)}
                    >
                        <ColorSwatch
                            color={`var(--mantine-color-${option.value}-filled)`}
                            size={32}
                        >
                            {value === option.value && (
                                <CheckIcon size={14} color="white" />
                            )}
                        </ColorSwatch>
                    </UnstyledButton>
                </Tooltip>
            ))}
        </Group>
    </Stack>
);
