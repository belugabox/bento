import {
    ActionIcon,
    Alert,
    Anchor,
    Button,
    Card,
    Group,
    Image,
    Indicator,
    Loader,
    Popover,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconFilter,
    IconPencil,
    IconSearch,
    IconSortAscending,
    IconSortDescending,
    IconWand,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { compareNames, genreKey } from '@server/types';

import { CompletenessBadge } from '@/components/CompletenessBadge';
import { ageLabel } from '@/components/ageLimits';
import { completenessOf } from '@/components/completeness';
import { formatSize, ratingLabel } from '@/components/format';
import {
    type ManagedSeries,
    fetchFormats,
    fetchManagedSeries,
    seriesCoverUrl,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Filtres (bouton « Filtres ») ; toutes les séries par défaut. */
const FILTERS = [
    { value: 'all', label: 'Toutes' },
    { value: 'to-classify', label: 'À classer' },
    { value: 'no-summary', label: 'Sans résumé' },
    { value: 'no-genre', label: 'Sans genre' },
    { value: 'incomplete', label: 'Fiche < 80 %' },
    // Fiches changées en ligne (mise à jour de nuit).
    { value: 'to-review', label: 'Fiches à revoir' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

const STATUSES = [
    { value: 'ongoing', label: 'En cours' },
    { value: 'completed', label: 'Terminée' },
];
const STATUS_LABELS = {
    ongoing: 'En cours de parution',
    completed: 'Terminée',
} as const;

type SortKey =
    | 'name'
    | 'format'
    | 'age'
    | 'status'
    | 'completeness'
    | 'volumes'
    | 'size'
    | 'perPage'
    | 'added'
    | 'rating';

/** Une série du tableau, avec sa complétude et ses moyennes. */
type Row = ManagedSeries & {
    percent: number;
    missing: string[];
    effectiveAge: number | null;
    perVolume: number;
    perPage: number;
};

const toRow = (s: ManagedSeries): Row => {
    const effectiveAge = s.age ?? s.fileAge;
    const { percent, missing } = completenessOf({
        name: s.name,
        hasFormat: !!s.formatId,
        hasAge: effectiveAge !== null,
        hasStatus: !!s.status,
        hasRating: s.rating !== null,
        genreCount: s.genres.length,
        writer: s.writer,
        penciller: s.penciller,
        publisher: s.publisher,
        summary: s.hasSummary ? 'oui' : '',
        volumes: {
            total: s.volumeCount,
            withNumber: s.withNumber,
            withYear: s.withYear,
        },
    });
    return {
        ...s,
        percent,
        missing,
        effectiveAge,
        perVolume: s.volumeCount ? s.size / s.volumeCount : 0,
        perPage: s.pageCount ? s.size / s.pageCount : 0,
    };
};

const matches = (row: Row, filter: Filter) => {
    switch (filter) {
        case 'to-classify':
            return !row.formatId || row.effectiveAge === null;
        case 'no-summary':
            return !row.hasSummary;
        case 'no-genre':
            return row.genres.length === 0;
        case 'incomplete':
            return row.percent < 80;
        case 'to-review':
            return row.sheetChanges.length > 0;
        default:
            return true;
    }
};

// Valeur de tri : les vides à la fin, quel que soit le sens.
const sortValue = (row: Row, key: SortKey): string | number | null => {
    switch (key) {
        case 'format':
            return row.format;
        case 'age':
            return row.effectiveAge;
        case 'status':
            return row.status;
        case 'completeness':
            return row.percent;
        case 'volumes':
            return row.volumeCount;
        case 'size':
            return row.size;
        case 'perPage':
            return row.perPage;
        case 'rating':
            return row.rating ?? null;
        case 'added':
            return row.lastAddedAt ? new Date(row.lastAddedAt).getTime() : null;
        default:
            return null;
    }
};

const compareRows = (key: SortKey, desc: boolean) => (a: Row, b: Row) => {
    if (key !== 'name') {
        const x = sortValue(a, key);
        const y = sortValue(b, key);
        if (x === null && y !== null) return 1;
        if (y === null && x !== null) return -1;
        if (x !== null && y !== null && x !== y) {
            const order =
                typeof x === 'string'
                    ? x.localeCompare(String(y), 'fr')
                    : x - Number(y);
            return desc ? -order : order;
        }
    }
    const byName = compareNames(a.name, b.name);
    return key === 'name' && desc ? -byName : byName;
};

/** Tris proposés (« Trier par »). */
const SORTS: { value: SortKey; label: string }[] = [
    { value: 'name', label: 'Nom' },
    { value: 'format', label: 'Format' },
    { value: 'age', label: 'Âge' },
    { value: 'status', label: 'Statut' },
    { value: 'completeness', label: 'Fiche' },
    { value: 'volumes', label: 'Tomes' },
    { value: 'size', label: 'Taille' },
    { value: 'perPage', label: 'Taille par page' },
    { value: 'added', label: 'Dernier ajout' },
    { value: 'rating', label: 'Note' },
];

const formatDay = (iso: string | null) =>
    iso
        ? new Date(iso).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
          })
        : '—';

/**
 * Gestion des séries (admin) : toutes les séries en cartes, les fiches les
 * moins complètes d'abord, à trier et à filtrer ; chaque carte dit ce qui
 * manque et mène à l'éditeur (« Remplir », « Modifier »).
 */
export const SeriesManagementPage = () => {
    const [params, setParams] = useSearchParams();
    const filter = (params.get('filter') as Filter | null) ?? 'all';
    // Les fiches les moins complètes d'abord.
    const sort = (params.get('sort') as SortKey | null) ?? 'completeness';
    const desc = params.get('dir') === 'desc';
    const formatFilter = params.get('format');
    const statusFilter = params.get('status');
    const [search, setSearch] = useState('');
    const { data, error } = useQuery(fetchManagedSeries, []);
    const formats = useQuery(fetchFormats, []);

    const update = (changes: Record<string, string | null>) =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                for (const [key, value] of Object.entries(changes)) {
                    if (value) next.set(key, value);
                    else next.delete(key);
                }
                return next;
            },
            { replace: true },
        );

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!data) return <Loader mx="auto" />;

    const rows = data.map(toRow);
    const counts = Object.fromEntries(
        FILTERS.map((f) => [
            f.value,
            rows.filter((r) => matches(r, f.value)).length,
        ]),
    );
    const text = genreKey(search);
    const shown = rows
        .filter(
            (r) =>
                matches(r, filter) &&
                (!formatFilter ||
                    (formatFilter === 'none'
                        ? !r.formatId
                        : String(r.formatId) === formatFilter)) &&
                (!statusFilter ||
                    (statusFilter === 'none'
                        ? !r.status
                        : r.status === statusFilter)),
        )
        .filter((r) => !text || genreKey(r.name).includes(text))
        .sort(compareRows(sort, desc));

    const formatChoices = (formats.data ?? []).map((f) => ({
        value: String(f.id),
        label: f.name,
    }));
    const extraFilters =
        (filter !== 'all' ? 1 : 0) +
        (formatFilter ? 1 : 0) +
        (statusFilter ? 1 : 0);
    const chooseFilter = (value: Filter) =>
        update({ filter: value === 'all' ? null : value });

    return (
        <Stack gap="sm">
            <div>
                <Title order={2}>Séries</Title>
                <Text size="sm" c="dimmed">
                    Les fiches les moins complètes d’abord. Sans âge, une série
                    est masquée aux comptes limités.
                </Text>
            </div>

            {/* Outils : toujours visibles en haut (sous l'en-tête). */}
            <Stack
                gap={8}
                py={8}
                style={{
                    position: 'sticky',
                    top: 'var(--app-shell-header-height, 56px)',
                    zIndex: 10,
                    background: 'var(--mantine-color-body)',
                }}
            >
                <Group gap={6} wrap="nowrap">
                    <TextInput
                        placeholder="Chercher une série"
                        aria-label="Chercher une série"
                        leftSection={<IconSearch size={14} />}
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        style={{ flex: 1, minWidth: 0 }}
                    />
                    <Select
                        aria-label="Trier par"
                        w={{ base: 120, sm: 170 }}
                        allowDeselect={false}
                        data={SORTS}
                        value={sort}
                        onChange={(value) =>
                            update({
                                sort: value === 'completeness' ? null : value,
                            })
                        }
                    />
                    <Tooltip label={desc ? 'Décroissant' : 'Croissant'}>
                        <ActionIcon
                            variant="default"
                            size="input-sm"
                            aria-label={
                                desc ? 'Ordre décroissant' : 'Ordre croissant'
                            }
                            onClick={() =>
                                update({ dir: desc ? null : 'desc' })
                            }
                        >
                            {desc ? (
                                <IconSortDescending size={18} />
                            ) : (
                                <IconSortAscending size={18} />
                            )}
                        </ActionIcon>
                    </Tooltip>
                    {/* Format et statut : rangés ici, pour garder la
                        barre sur une ligne. */}
                    <Popover position="bottom-end" shadow="md" withArrow>
                        <Popover.Target>
                            <Indicator
                                disabled={extraFilters === 0}
                                label={extraFilters}
                                size={16}
                            >
                                <ActionIcon
                                    variant={extraFilters ? 'light' : 'default'}
                                    size="input-sm"
                                    aria-label="Filtres"
                                >
                                    <IconFilter size={18} />
                                </ActionIcon>
                            </Indicator>
                        </Popover.Target>
                        <Popover.Dropdown>
                            <Stack gap="xs" w={220}>
                                <Select
                                    label="Fiches"
                                    allowDeselect={false}
                                    comboboxProps={{ withinPortal: false }}
                                    data={FILTERS.map((f) => ({
                                        value: f.value,
                                        label: `${f.label} (${counts[f.value]})`,
                                    }))}
                                    value={filter}
                                    onChange={(value) =>
                                        value && chooseFilter(value as Filter)
                                    }
                                />
                                <Select
                                    label="Format"
                                    placeholder="Tous les formats"
                                    clearable
                                    comboboxProps={{ withinPortal: false }}
                                    data={[
                                        { value: 'none', label: 'Sans format' },
                                        ...formatChoices,
                                    ]}
                                    value={formatFilter}
                                    onChange={(value) =>
                                        update({ format: value })
                                    }
                                />
                                <Select
                                    label="Statut"
                                    placeholder="Tous les statuts"
                                    clearable
                                    comboboxProps={{ withinPortal: false }}
                                    data={[
                                        { value: 'none', label: 'Sans statut' },
                                        ...STATUSES,
                                    ]}
                                    value={statusFilter}
                                    onChange={(value) =>
                                        update({ status: value })
                                    }
                                />
                            </Stack>
                        </Popover.Dropdown>
                    </Popover>
                </Group>
                <Group justify="space-between">
                    <Group gap="sm">
                        <Text size="xs" c="dimmed">
                            {shown.length} série{shown.length > 1 ? 's' : ''}
                        </Text>
                        {/* Fiches changées en ligne : un lien discret. */}
                        {counts['to-review'] > 0 && filter !== 'to-review' && (
                            <Anchor
                                component="button"
                                size="xs"
                                c="orange"
                                onClick={() => chooseFilter('to-review')}
                            >
                                {counts['to-review']} fiche
                                {counts['to-review'] > 1 ? 's' : ''} à revoir
                            </Anchor>
                        )}
                        {filter !== 'all' && (
                            <Anchor
                                component="button"
                                size="xs"
                                onClick={() => chooseFilter('all')}
                            >
                                Voir toutes
                            </Anchor>
                        )}
                    </Group>
                </Group>
            </Stack>

            {shown.length === 0 ? (
                <Alert color="gray">
                    {text || filter === 'all'
                        ? 'Aucune série.'
                        : 'Aucune série dans ce filtre.'}
                </Alert>
            ) : (
                <SimpleGrid
                    cols={{ base: 1, sm: 2, lg: 3 }}
                    spacing="sm"
                    data-testid="managed-series"
                >
                    {shown.map((s) => (
                        <Card
                            key={s.id}
                            withBorder
                            padding="sm"
                            radius="md"
                            data-testid="managed-card"
                        >
                            <Stack gap="sm" h="100%" justify="space-between">
                                <Group
                                    gap="sm"
                                    wrap="nowrap"
                                    align="flex-start"
                                >
                                    <Image
                                        src={seriesCoverUrl(s, 'small')}
                                        w={48}
                                        h={72}
                                        fit="cover"
                                        radius="sm"
                                        alt=""
                                        loading="lazy"
                                        style={{ flexShrink: 0 }}
                                    />
                                    <Stack
                                        gap={2}
                                        style={{ flex: 1, minWidth: 0 }}
                                    >
                                        <Anchor
                                            component={Link}
                                            to={`/series/${s.id}`}
                                            fw={500}
                                            lineClamp={1}
                                        >
                                            {s.name}
                                        </Anchor>
                                        <Text size="xs" c="dimmed">
                                            {[
                                                s.format ?? 'Sans format',
                                                s.effectiveAge !== null &&
                                                    ageLabel(s.effectiveAge),
                                                s.status &&
                                                    STATUS_LABELS[s.status],
                                                s.rating != null &&
                                                    ratingLabel(s.rating),
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            {[
                                                `${s.volumeCount} tome${s.volumeCount > 1 ? 's' : ''}`,
                                                formatSize(s.size),
                                                `${formatSize(s.perVolume)} / tome`,
                                                `${formatSize(s.perPage)} / page`,
                                            ].join(' · ')}
                                        </Text>
                                        <Text
                                            size="xs"
                                            c="dimmed"
                                            lineClamp={1}
                                        >
                                            {[
                                                s.genres.join(', '),
                                                s.lastAddedAt &&
                                                    `ajout ${formatDay(s.lastAddedAt)}`,
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </Text>
                                        {/* Changé sur le site depuis la
                                            dernière visite : rien
                                            d'appliqué, à revoir. */}
                                        {s.sheetChanges.length > 0 && (
                                            <Text size="xs" c="orange">
                                                Fiche à revoir :{' '}
                                                {s.sheetChanges.join(' · ')}
                                            </Text>
                                        )}
                                    </Stack>
                                </Group>
                                <Group
                                    justify="space-between"
                                    wrap="nowrap"
                                    align="flex-start"
                                >
                                    {/* Ce qui manque, dans la bulle : sans
                                        avoir à l'ouvrir. */}
                                    <div style={{ minWidth: 0 }}>
                                        <CompletenessBadge
                                            withMissing
                                            completeness={{
                                                percent: s.percent,
                                                missing: s.missing,
                                            }}
                                        />
                                    </div>
                                    <Group gap={6} wrap="nowrap">
                                        <Button
                                            component={Link}
                                            to={`/series/${s.id}/edit?fill=online&from=to-classify`}
                                            size="compact-sm"
                                            variant="light"
                                            leftSection={<IconWand size={14} />}
                                            color={
                                                s.sheetChanges.length > 0
                                                    ? 'orange'
                                                    : undefined
                                            }
                                            aria-label={`${s.sheetChanges.length > 0 ? 'Revoir' : 'Remplir'} ${s.name}`}
                                        >
                                            {s.sheetChanges.length > 0
                                                ? 'Revoir'
                                                : 'Remplir'}
                                        </Button>
                                        <Button
                                            component={Link}
                                            to={`/series/${s.id}/edit?from=to-classify`}
                                            size="compact-sm"
                                            variant="default"
                                            leftSection={
                                                <IconPencil size={14} />
                                            }
                                            aria-label={`Modifier ${s.name}`}
                                        >
                                            Modifier
                                        </Button>
                                    </Group>
                                </Group>
                            </Stack>
                        </Card>
                    ))}
                </SimpleGrid>
            )}
        </Stack>
    );
};
