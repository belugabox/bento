import {
    Button,
    Divider,
    Group,
    Input,
    Modal,
    SegmentedControl,
    Stack,
    Switch,
    Text,
} from '@mantine/core';

import { AccentPicker, ColorSchemeControl } from './ThemePickers';
import {
    type CardSize,
    LAYOUT_OPTIONS,
    type LibraryLayout,
    SIZE_OPTIONS,
    useLibraryDisplay,
} from './libraryDisplay';
import { useAppearance } from './theme';

/**
 * Apparence de l'appli sur cet appareil : mode, couleur d'accent, et
 * affichage des séries (grille ou liste, taille des cartes).
 */
export const AppearanceModal = ({
    opened,
    onClose,
}: {
    opened: boolean;
    onClose: () => void;
}) => {
    const appearance = useAppearance();
    const display = useLibraryDisplay();
    const list = display.layout === 'list';

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

                <Divider label="Affichage des séries" labelPosition="left" />
                <Input.Wrapper label="Affichage">
                    <SegmentedControl
                        fullWidth
                        value={display.layout}
                        onChange={(value) =>
                            display.set({ layout: value as LibraryLayout })
                        }
                        data={LAYOUT_OPTIONS}
                    />
                </Input.Wrapper>
                <Input.Wrapper label="Taille des cartes">
                    <SegmentedControl
                        fullWidth
                        disabled={list}
                        value={display.size}
                        onChange={(value) =>
                            display.set({ size: value as CardSize })
                        }
                        data={SIZE_OPTIONS}
                    />
                </Input.Wrapper>
                <Switch
                    label="Couvertures seules"
                    description="Sans titre sous les couvertures de l’accueil."
                    disabled={list}
                    checked={display.coversOnly}
                    onChange={(event) =>
                        display.set({
                            coversOnly: event.currentTarget.checked,
                        })
                    }
                />
            </Stack>
        </Modal>
    );
};
