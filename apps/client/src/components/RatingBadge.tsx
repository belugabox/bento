import {
    Badge,
    Group,
    Popover,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';

import { SOURCE_LABELS } from '@server/types';

import { ratingLabel, reviewsLabel } from '@/components/format';
import type { RatingSummary } from '@/components/rating';

/**
 * Note des lecteurs (fiche série, éditeur) : « ★ 4,4 », la note de chaque
 * site au clic ; « Pas de note » tant qu'aucune fiche n'en a donné.
 */
export const RatingBadge = ({ rating }: { rating: RatingSummary | null }) => (
    <Popover position="bottom-start" withArrow shadow="md">
        <Popover.Target>
            <UnstyledButton aria-label="Détail de la note">
                <Badge
                    variant="light"
                    color={rating ? 'yellow' : 'gray'}
                    style={{ cursor: 'pointer' }}
                >
                    {rating ? ratingLabel(rating.value) : '☆ Pas de note'}
                </Badge>
            </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown maw={300}>
            <Stack gap={6}>
                <Text size="sm" fw={600}>
                    Note des lecteurs
                </Text>
                {rating ? (
                    rating.sources.map((source) => (
                        <Group
                            key={source.site}
                            justify="space-between"
                            gap="lg"
                        >
                            <Text size="sm">{SOURCE_LABELS[source.site]}</Text>
                            <Text size="sm">
                                {ratingLabel(source.value)}{' '}
                                <Text span size="xs" c="dimmed">
                                    {reviewsLabel(source.count)}
                                </Text>
                            </Text>
                        </Group>
                    ))
                ) : (
                    <Text size="xs" c="dimmed">
                        Relevée sur Manga-news ou Bedetheque par « Remplir » ou
                        « Mettre à jour ».
                    </Text>
                )}
            </Stack>
        </Popover.Dropdown>
    </Popover>
);
