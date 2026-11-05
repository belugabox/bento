import {
    CheckIcon,
    ColorSwatch,
    Group,
    type MantineColorScheme,
    Modal,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
    useMantineColorScheme,
} from '@mantine/core';

import { ACCENTS, useAccent } from './theme';

/** Apparence de l'appli sur cet appareil : mode et couleur d'accent. */
export const AppearanceModal = ({
    opened,
    onClose,
}: {
    opened: boolean;
    onClose: () => void;
}) => {
    const { colorScheme, setColorScheme } = useMantineColorScheme();
    const [accent, setAccent] = useAccent();

    return (
        <Modal opened={opened} onClose={onClose} title="Apparence">
            <Stack>
                <Stack gap={6}>
                    <Text size="sm" fw={500}>
                        Mode
                    </Text>
                    <SegmentedControl
                        fullWidth
                        value={colorScheme}
                        onChange={(value) =>
                            setColorScheme(value as MantineColorScheme)
                        }
                        data={[
                            { value: 'light', label: 'Clair' },
                            { value: 'dark', label: 'Sombre' },
                            { value: 'auto', label: 'Système' },
                        ]}
                    />
                </Stack>
                <Stack gap={6}>
                    <Text size="sm" fw={500}>
                        Couleur
                    </Text>
                    <Group gap="xs">
                        {ACCENTS.map((option) => (
                            <Tooltip key={option.value} label={option.label}>
                                <UnstyledButton
                                    aria-label={option.label}
                                    aria-pressed={accent === option.value}
                                    onClick={() => setAccent(option.value)}
                                >
                                    <ColorSwatch
                                        color={`var(--mantine-color-${option.value}-filled)`}
                                        size={32}
                                    >
                                        {accent === option.value && (
                                            <CheckIcon
                                                size={14}
                                                color="white"
                                            />
                                        )}
                                    </ColorSwatch>
                                </UnstyledButton>
                            </Tooltip>
                        ))}
                    </Group>
                </Stack>
                <Text size="xs" c="dimmed">
                    Réglage gardé sur cet appareil.
                </Text>
            </Stack>
        </Modal>
    );
};
