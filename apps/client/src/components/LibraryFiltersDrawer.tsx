import {
    Button,
    Chip,
    Drawer,
    Group,
    Stack,
    Text,
    useMatches,
} from '@mantine/core';
import type { ReactNode } from 'react';

import { UserAvatar } from '@/components/accounts/UserAvatar';
import {
    type LibraryFilters,
    NO_FILTERS,
    READING_FILTERS,
    RELEASE_FILTERS,
    filterCount,
    toggle,
} from '@/components/libraryFilters';
import type { FamilyReader } from '@/services/api';

/** Un filtre : son titre, puis ses pastilles. */
const FilterGroup = ({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) => (
    <Stack gap={8} role="group" aria-label={label}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.06em">
            {label}
        </Text>
        <Group gap={6}>{children}</Group>
    </Stack>
);

/**
 * Filtres de la bibliothèque, dans un tiroir : en bas sur un téléphone, à
 * droite au-delà. Chaque pastille s'applique tout de suite ; le bouton du
 * bas dit combien de séries restent.
 */
export const LibraryFiltersDrawer = ({
    opened,
    onClose,
    filters,
    onChange,
    formats,
    genres,
    readers,
    downloads,
    resultCount,
}: {
    opened: boolean;
    onClose: () => void;
    filters: LibraryFilters;
    onChange: (filters: LibraryFilters) => void;
    /** Formats présents dans la bibliothèque. */
    formats: string[];
    /** Genres présents, les plus fréquents d'abord, avec leur nombre. */
    genres: { name: string; count: number }[];
    readers: FamilyReader[];
    /** Des tomes sont-ils téléchargés sur l'appareil ? */
    downloads: boolean;
    /** Séries gardées par ces filtres. */
    resultCount: number;
}) => {
    const position = useMatches<'bottom' | 'right'>({
        base: 'bottom',
        sm: 'right',
    });
    const set = (changes: Partial<LibraryFilters>) =>
        onChange({ ...filters, ...changes });
    const chip = (
        key: string,
        checked: boolean,
        onClick: () => void,
        label: ReactNode,
    ) => (
        <Chip key={key} size="sm" checked={checked} onChange={onClick}>
            {label}
        </Chip>
    );

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            title="Filtres"
            position={position}
            size={position === 'bottom' ? '85%' : 380}
            radius={position === 'bottom' ? 'md' : 0}
            styles={{
                body: {
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 'calc(100% - 60px)',
                },
            }}
        >
            <Stack gap="lg" style={{ flex: 1 }}>
                <FilterGroup label="Ma lecture">
                    {READING_FILTERS.map((f) =>
                        chip(
                            f.value,
                            filters.reading.includes(f.value),
                            () =>
                                set({
                                    reading: toggle(filters.reading, f.value),
                                }),
                            f.label,
                        ),
                    )}
                </FilterGroup>
                {formats.length > 1 && (
                    <FilterGroup label="Format">
                        {formats.map((name) =>
                            chip(
                                name,
                                filters.formats.includes(name),
                                () =>
                                    set({
                                        formats: toggle(filters.formats, name),
                                    }),
                                name,
                            ),
                        )}
                    </FilterGroup>
                )}
                {genres.length > 0 && (
                    <FilterGroup label="Genres et thèmes">
                        {genres.map(({ name, count }) =>
                            chip(
                                name,
                                filters.genres.includes(name),
                                () =>
                                    set({
                                        genres: toggle(filters.genres, name),
                                    }),
                                <>
                                    {name}{' '}
                                    <Text span size="xs" c="dimmed">
                                        {count}
                                    </Text>
                                </>,
                            ),
                        )}
                    </FilterGroup>
                )}
                <FilterGroup label="Parution">
                    {RELEASE_FILTERS.map((f) =>
                        chip(
                            f.value,
                            filters.release.includes(f.value),
                            () =>
                                set({
                                    release: toggle(filters.release, f.value),
                                }),
                            f.label,
                        ),
                    )}
                </FilterGroup>
                {readers.length > 0 && (
                    <FilterGroup label="Lu par">
                        {readers.map((reader) =>
                            chip(
                                String(reader.id),
                                filters.readers.includes(reader.id),
                                () =>
                                    set({
                                        readers: toggle(
                                            filters.readers,
                                            reader.id,
                                        ),
                                    }),
                                <Group gap={6} wrap="nowrap" component="span">
                                    <UserAvatar
                                        name={reader.name}
                                        seed={reader.avatarSeed}
                                        size={18}
                                    />
                                    {reader.name}
                                </Group>,
                            ),
                        )}
                    </FilterGroup>
                )}
                {downloads && (
                    <FilterGroup label="Sur cet appareil">
                        {chip(
                            'device',
                            filters.downloaded,
                            () => set({ downloaded: !filters.downloaded }),
                            'Téléchargées',
                        )}
                    </FilterGroup>
                )}
            </Stack>
            {/* Toujours visible, en bas du tiroir. */}
            <Group
                grow
                gap="sm"
                pt="md"
                pb="xs"
                style={{
                    position: 'sticky',
                    bottom: 0,
                    background: 'var(--mantine-color-body)',
                }}
            >
                <Button
                    variant="default"
                    disabled={filterCount(filters) === 0}
                    onClick={() => onChange(NO_FILTERS)}
                >
                    Effacer
                </Button>
                <Button onClick={onClose}>
                    Voir {resultCount} série{resultCount > 1 ? 's' : ''}
                </Button>
            </Group>
        </Drawer>
    );
};
