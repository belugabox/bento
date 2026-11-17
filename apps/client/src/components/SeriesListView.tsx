import {
    Badge,
    Box,
    Group,
    Image,
    Progress,
    Stack,
    Text,
    UnstyledButton,
    useMatches,
} from '@mantine/core';
import { IconBook, IconChevronDown } from '@tabler/icons-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';

import { SeriesCardMenu } from '@/components/CardMenus';
import { SeriesCard } from '@/components/SeriesCard';
import { ratingLabel } from '@/components/format';
import {
    newBadge,
    releaseLabel,
    seriesSubtitle,
} from '@/components/seriesCardParts';
import {
    type SeriesSort,
    creditsOf,
    readingStateOf,
    seriesDetails,
} from '@/components/seriesFilters';
import { type SeriesSummary, seriesCoverUrl } from '@/services/api';

// Couverture, série, lecture, note, parution, statut ; le menu à part.
const COLUMNS = '44px minmax(0, 3fr) minmax(0, 1.4fr) 72px 110px 120px';

const STATUS_LABELS = {
    ongoing: 'En cours',
    completed: 'Terminée',
} as const;

/** En-tête de colonne : un clic trie par elle. */
const SortHeader = ({
    label,
    value,
    sort,
    onSort,
}: {
    label: string;
    value?: SeriesSort;
    sort: SeriesSort;
    onSort: (sort: SeriesSort) => void;
}) => {
    const style: CSSProperties = {
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
    };
    if (!value) {
        return (
            <Text c="dimmed" style={style}>
                {label}
            </Text>
        );
    }
    const active = sort === value;
    return (
        <UnstyledButton
            onClick={() => onSort(value)}
            aria-pressed={active}
            c={active ? 'var(--mantine-primary-color-light-color)' : 'dimmed'}
            style={{ ...style, display: 'inline-flex', alignItems: 'center' }}
        >
            {label}
            {active && <IconChevronDown size={12} />}
        </UnstyledButton>
    );
};

/** Une ligne du tableau : la série (lien), puis son menu. */
const Row = ({
    series: s,
    isAdmin,
    onChanged,
}: {
    series: SeriesSummary;
    isAdmin: boolean;
    onChanged: () => void;
}) => {
    const cover = seriesCoverUrl(s, 'small');
    const started = readingStateOf(s) === 'started';
    return (
        <Group
            gap={4}
            wrap="nowrap"
            style={{
                borderBottom: '1px solid var(--mantine-color-default-border)',
            }}
        >
            <Box
                component={Link}
                to={`/series/${s.id}`}
                py={6}
                style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'grid',
                    gridTemplateColumns: COLUMNS,
                    gap: 12,
                    alignItems: 'center',
                    color: 'inherit',
                    textDecoration: 'none',
                }}
            >
                <Box
                    w={44}
                    h={66}
                    style={{
                        borderRadius: 4,
                        overflow: 'hidden',
                        display: 'grid',
                        placeItems: 'center',
                        background:
                            'light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))',
                    }}
                >
                    {cover ? (
                        <Image
                            src={cover}
                            alt=""
                            loading="lazy"
                            w={44}
                            h={66}
                            fit="cover"
                        />
                    ) : (
                        <IconBook size={18} />
                    )}
                </Box>
                <Stack gap={0} style={{ minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={500} truncate>
                            {s.name}
                        </Text>
                        {newBadge(s.newCount)}
                    </Group>
                    <Text size="xs" c="dimmed" truncate>
                        {creditsOf(s)}
                    </Text>
                </Stack>
                <Stack gap={4} style={{ minWidth: 0 }}>
                    <Text
                        size="xs"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                        {seriesSubtitle(s)}
                    </Text>
                    {started && (
                        <Progress
                            size="xs"
                            maw={120}
                            value={(s.readCount / s.volumeCount) * 100}
                            aria-label="Avancement"
                        />
                    )}
                </Stack>
                <Text size="xs" c="dimmed">
                    {s.rating != null ? ratingLabel(s.rating) : '—'}
                </Text>
                <Text size="xs" c="dimmed">
                    {releaseLabel(s) || '—'}
                </Text>
                <Box>
                    {s.status && (
                        <Badge
                            variant="light"
                            color={s.status === 'ongoing' ? 'green' : 'gray'}
                            size="sm"
                        >
                            {STATUS_LABELS[s.status]}
                        </Badge>
                    )}
                </Box>
            </Box>
            <SeriesCardMenu
                series={s}
                isAdmin={isAdmin}
                onChanged={onChanged}
            />
        </Group>
    );
};

/**
 * Bibliothèque en liste : sur un écran assez large, un tableau aux colonnes
 * triables ; sur un téléphone, une ligne compacte par série.
 */
export const SeriesListView = ({
    series,
    sort,
    onSort,
    isAdmin,
    onChanged,
    letterOf,
}: {
    series: SeriesSummary[];
    sort: SeriesSort;
    onSort: (sort: SeriesSort) => void;
    isAdmin: boolean;
    onChanged: () => void;
    /** Repère de l'index A–Z, sur la première série de chaque lettre. */
    letterOf?: (s: SeriesSummary) => string | undefined;
}) => {
    const wide = useMatches({ base: false, sm: true });
    const anchored = (s: SeriesSummary, child: ReactNode) => (
        <div key={s.id} data-letter={letterOf?.(s)}>
            {child}
        </div>
    );
    if (!wide) {
        return (
            <Stack gap={6}>
                {series.map((s) =>
                    anchored(
                        s,
                        <SeriesCard
                            series={s}
                            isAdmin={isAdmin}
                            onChanged={onChanged}
                            layout="row"
                            details={seriesDetails(s)}
                        />,
                    ),
                )}
            </Stack>
        );
    }
    return (
        <Box data-testid="series-list">
            <Group gap={4} wrap="nowrap" pb={6}>
                <Box
                    style={{
                        flex: 1,
                        display: 'grid',
                        gridTemplateColumns: COLUMNS,
                        gap: 12,
                    }}
                >
                    <span />
                    <SortHeader
                        label="Série"
                        value="name"
                        sort={sort}
                        onSort={onSort}
                    />
                    <SortHeader
                        label="Lecture"
                        value="lastRead"
                        sort={sort}
                        onSort={onSort}
                    />
                    <SortHeader
                        label="Note"
                        value="rating"
                        sort={sort}
                        onSort={onSort}
                    />
                    <SortHeader
                        label="Parution"
                        value="year"
                        sort={sort}
                        onSort={onSort}
                    />
                    <SortHeader label="Statut" sort={sort} onSort={onSort} />
                </Box>
                {/* Place du menu de chaque ligne. */}
                <Box w={28} />
            </Group>
            {series.map((s) =>
                anchored(
                    s,
                    <Row series={s} isAdmin={isAdmin} onChanged={onChanged} />,
                ),
            )}
        </Box>
    );
};
