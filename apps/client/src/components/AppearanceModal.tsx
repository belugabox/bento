import { Button, Group, Modal, Stack, Text } from '@mantine/core';

import { AccentPicker, ColorSchemeControl } from './ThemePickers';
import { useAppearance } from './theme';

/** Apparence de l'appli sur cet appareil : mode et couleur d'accent. */
export const AppearanceModal = ({
    opened,
    onClose,
}: {
    opened: boolean;
    onClose: () => void;
}) => {
    const appearance = useAppearance();

    return (
        <Modal opened={opened} onClose={onClose} title="Apparence">
            <Stack>
                <ColorSchemeControl
                    value={appearance.colorScheme}
                    onChange={appearance.setColorScheme}
                />
                <AccentPicker
                    value={appearance.accent}
                    onChange={appearance.setAccent}
                />
                <Group justify="space-between" wrap="nowrap">
                    <Text size="xs" c="dimmed">
                        {appearance.custom
                            ? 'Réglage gardé sur cet appareil.'
                            : 'Thème par défaut de Bento.'}
                    </Text>
                    <Button
                        size="xs"
                        variant="subtle"
                        disabled={!appearance.custom}
                        onClick={appearance.reset}
                    >
                        Thème par défaut
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
