import { ActionIcon, Box, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Children, type ReactNode, useRef } from 'react';

import type { LibraryLayout } from '@/components/libraryDisplay';

// Écart entre les cartes (celui de la grille, « sm »).
const GAP = 12;
// En liste, une carte-ligne garde une largeur lisible.
const LIST_CARD = 320;

/**
 * Rangée « Reprendre » de l'accueil : les tomes en cours, sur une ligne qui
 * défile de côté, au-dessus de la grille. Les cartes ont la largeur d'une
 * colonne de la grille ; s'il y en a plus, la suivante dépasse un peu.
 */
export const ResumeRow = ({
    columns,
    layout,
    children,
}: {
    columns: number;
    layout: LibraryLayout;
    children: ReactNode;
}) => {
    const { ref, width } = useElementSize();
    const viewport = useRef<HTMLDivElement>(null);
    const count = Children.count(children);
    const overflow = count > columns;
    // Une part de carte en plus visible : la rangée défile.
    const shown = overflow ? columns + 0.25 : columns;
    const gridCard = width ? (width - (columns - 1) * GAP) / shown : 0;
    const cardWidth =
        layout === 'list' ? Math.min(LIST_CARD, width || LIST_CARD) : gridCard;
    const scroll = (direction: 1 | -1) =>
        viewport.current?.scrollBy({
            left: direction * (width - GAP),
            behavior: 'smooth',
        });

    return (
        <Stack gap={6} ref={ref}>
            <Group justify="space-between" h={22}>
                <Text size="sm" fw={500} c="dimmed">
                    Reprendre
                </Text>
                {overflow && (
                    <Group gap={4} visibleFrom="sm">
                        <ActionIcon
                            variant="subtle"
                            size="sm"
                            aria-label="Tomes précédents"
                            onClick={() => scroll(-1)}
                        >
                            <IconChevronLeft size={16} />
                        </ActionIcon>
                        <ActionIcon
                            variant="subtle"
                            size="sm"
                            aria-label="Tomes suivants"
                            onClick={() => scroll(1)}
                        >
                            <IconChevronRight size={16} />
                        </ActionIcon>
                    </Group>
                )}
            </Group>
            <ScrollArea
                type="hover"
                scrollbars="x"
                offsetScrollbars
                viewportRef={viewport}
            >
                <Group
                    gap={GAP}
                    wrap="nowrap"
                    align="stretch"
                    data-testid="resume-row"
                >
                    {Children.map(children, (child) => (
                        <Box
                            style={{
                                flex: `0 0 ${cardWidth}px`,
                                minWidth: 0,
                            }}
                        >
                            {child}
                        </Box>
                    ))}
                </Group>
            </ScrollArea>
        </Stack>
    );
};
