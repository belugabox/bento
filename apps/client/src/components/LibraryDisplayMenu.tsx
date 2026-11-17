import {
    Box,
    Button,
    Center,
    Chip,
    Group,
    Indicator,
    Popover,
    SegmentedControl,
    Slider,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import {
    IconAdjustmentsHorizontal,
    IconLayoutGrid,
    IconList,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { GROUPINGS, type Grouping } from '@/components/homeGroups';
import {
    CARD_SIZES,
    type LibraryLayout,
    type useLibraryDisplay,
} from '@/components/libraryDisplay';
import { SERIES_SORTS, type SeriesSort } from '@/components/seriesFilters';

const Section = ({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) => (
    <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.06em">
            {label}
        </Text>
        {children}
    </Stack>
);

/**
 * « Affichage » de la bibliothèque : grille ou liste, taille des cartes,
 * tri (dans l'adresse), groupement et séries lues (gardés sur l'appareil).
 */
export const LibraryDisplayMenu = ({
    display,
    sort,
    onSort,
}: {
    display: ReturnType<typeof useLibraryDisplay>;
    sort: SeriesSort;
    onSort: (sort: SeriesSort) => void;
}) => {
    const list = display.layout === 'list';
    // Tri, groupement ou séries lues masquées autres que par défaut.
    const changed =
        sort !== 'name' || display.groupBy !== 'none' || display.hideRead;
    return (
        <Popover position="bottom-end" shadow="md" width={300} withinPortal>
            <Popover.Target>
                {/* Un point quand l'affichage n'est pas celui par défaut
                    (visible aussi sur téléphone, bouton sans texte). */}
                <Indicator
                    size={9}
                    offset={4}
                    disabled={!changed}
                    aria-label={changed ? 'Affichage modifié' : undefined}
                >
                    <Button
                        variant="default"
                        radius="xl"
                        leftSection={<IconAdjustmentsHorizontal size={16} />}
                        aria-label="Affichage"
                        px={{ base: 10, xs: 14 }}
                    >
                        <Box component="span" visibleFrom="xs">
                            Affichage
                        </Box>
                    </Button>
                </Indicator>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap="md">
                    <SegmentedControl
                        fullWidth
                        aria-label="Vue"
                        value={display.layout}
                        onChange={(layout) =>
                            display.set({ layout: layout as LibraryLayout })
                        }
                        data={[
                            {
                                value: 'grid',
                                label: (
                                    <Center style={{ gap: 6 }}>
                                        <IconLayoutGrid size={16} /> Grille
                                    </Center>
                                ),
                            },
                            {
                                value: 'list',
                                label: (
                                    <Center style={{ gap: 6 }}>
                                        <IconList size={16} /> Liste
                                    </Center>
                                ),
                            },
                        ]}
                    />
                    {!list && (
                        <Section
                            label={`Taille des cartes : ${CARD_SIZES[display.size]?.label.toLowerCase()}`}
                        >
                            <Slider
                                min={0}
                                max={CARD_SIZES.length - 1}
                                step={1}
                                value={display.size}
                                onChange={(size) => display.set({ size })}
                                label={null}
                                marks={CARD_SIZES.map((_, value) => ({
                                    value,
                                }))}
                                thumbLabel="Taille des cartes"
                            />
                            <Switch
                                mt={4}
                                size="sm"
                                label="Couvertures seules"
                                checked={display.coversOnly}
                                onChange={(event) =>
                                    display.set({
                                        coversOnly: event.currentTarget.checked,
                                    })
                                }
                            />
                        </Section>
                    )}
                    <Section label="Trier par">
                        <Chip.Group
                            value={sort}
                            onChange={(value) => onSort(value as SeriesSort)}
                        >
                            <Group gap={6}>
                                {SERIES_SORTS.map((option) => (
                                    <Chip
                                        key={option.value}
                                        value={option.value}
                                        size="xs"
                                    >
                                        {option.label}
                                    </Chip>
                                ))}
                            </Group>
                        </Chip.Group>
                    </Section>
                    <Section label="Grouper par">
                        <Chip.Group
                            value={display.groupBy}
                            onChange={(value) =>
                                display.set({ groupBy: value as Grouping })
                            }
                        >
                            <Group gap={6}>
                                {GROUPINGS.map((option) => (
                                    <Chip
                                        key={option.value}
                                        value={option.value}
                                        size="xs"
                                    >
                                        {option.label}
                                    </Chip>
                                ))}
                            </Group>
                        </Chip.Group>
                    </Section>
                    <Switch
                        size="sm"
                        label="Masquer les séries lues"
                        checked={display.hideRead}
                        onChange={(event) =>
                            display.set({
                                hideRead: event.currentTarget.checked,
                            })
                        }
                    />
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
