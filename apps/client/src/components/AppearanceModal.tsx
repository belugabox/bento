import {
    Button,
    Divider,
    Group,
    Input,
    Modal,
    SegmentedControl,
    Slider,
    Stack,
    Switch,
    Text,
} from '@mantine/core';

import { AccentPicker, ColorSchemeControl } from './ThemePickers';
import {
    CARD_SIZES,
    LAYOUT_OPTIONS,
    type LibraryLayout,
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
                <Input.Wrapper label="Taille des cartes" pb="md">
                    <Slider
                        min={0}
                        max={CARD_SIZES.length - 1}
                        step={1}
                        disabled={list}
                        value={display.size}
                        onChange={(size) => display.set({ size })}
                        label={(size) => CARD_SIZES[size]?.label}
                        marks={[
                            { value: 0, label: 'Petites' },
                            { value: CARD_SIZES.length - 1, label: 'Grandes' },
                        ]}
                        thumbLabel="Taille des cartes"
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
