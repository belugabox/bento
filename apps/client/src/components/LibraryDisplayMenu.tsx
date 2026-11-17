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
    IconArrowsSort,
    IconLayoutGrid,
    IconList,
} from '@tabler/icons-react';
import type { ComponentPropsWithRef, ReactNode } from 'react';

import { GROUPINGS, type Grouping } from '@/components/homeGroups';
import {
    CARD_SIZES,
    type LibraryLayout,
    type useLibraryDisplay,
} from '@/components/libraryDisplay';
import { SERIES_SORTS, type SeriesSort } from '@/components/seriesFilters';

type Display = ReturnType<typeof useLibraryDisplay>;

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
 * Bouton d'un menu de la barre : l'icône seule sur un téléphone, et un
 * point quand le réglage n'est pas celui par défaut. Les autres propriétés
 * (clic, référence) viennent du menu qui l'ouvre.
 */
const MenuButton = ({
    label,
    icon,
    changed,
    ...others
}: {
    label: string;
    icon: ReactNode;
    changed: boolean;
} & ComponentPropsWithRef<'div'>) => (
    <Indicator
        {...others}
        size={9}
        offset={4}
        disabled={!changed}
        aria-label={changed ? `${label} modifié` : undefined}
    >
        <Button
            variant="default"
            radius="xl"
            leftSection={icon}
            aria-label={label}
            px={{ base: 10, xs: 14 }}
        >
            <Box component="span" visibleFrom="xs">
                {label}
            </Box>
        </Button>
    </Indicator>
);

/**
 * « Trier » : l'ordre des séries (dans l'adresse) et leur groupement (gardé
 * sur l'appareil). À part d'« Affichage » (demandé).
 */
export const LibrarySortMenu = ({
    display,
    sort,
    onSort,
}: {
    display: Display;
    sort: SeriesSort;
    onSort: (sort: SeriesSort) => void;
}) => (
    <Popover position="bottom-end" shadow="md" width={300} withinPortal>
        <Popover.Target>
            <MenuButton
                label="Trier"
                icon={<IconArrowsSort size={16} />}
                changed={sort !== 'name' || display.groupBy !== 'none'}
            />
        </Popover.Target>
        <Popover.Dropdown>
            <Stack gap="md">
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
            </Stack>
        </Popover.Dropdown>
    </Popover>
);

/**
 * « Affichage » de la bibliothèque, gardé sur l'appareil : grille ou
 * liste, taille des cartes, couvertures seules, séries lues masquées.
 */
export const LibraryDisplayMenu = ({ display }: { display: Display }) => {
    const list = display.layout === 'list';
    return (
        <Popover position="bottom-end" shadow="md" width={300} withinPortal>
            <Popover.Target>
                <MenuButton
                    label="Affichage"
                    icon={<IconAdjustmentsHorizontal size={16} />}
                    changed={display.hideRead}
                />
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
