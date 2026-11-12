import {
    ActionIcon,
    Alert,
    Anchor,
    Button,
    Card,
    Group,
    Image,
    Loader,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
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
import { ageLabel, ageOptions, useAgeSteps } from '@/components/ageLimits';
import { completenessOf } from '@/components/completeness';
import { formatSize, ratingLabel } from '@/components/format';
import {
    type ManagedSeries,
    fetchFormats,
    fetchManagedSeries,
    seriesCoverUrl,
    setSeriesClassification,
    setSeriesStatus,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Filtres rapides ; « À classer » par défaut. */
const FILTERS = [
    { value: 'to-classify', label: 'À classer' },
    { value: 'no-summary', label: 'Sans résumé' },
    { value: 'no-genre', label: 'Sans genre' },
    { value: 'incomplete', label: 'Fiche < 80 %' },
    { value: 'all', label: 'Toutes' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

const STATUSES = [
    { value: 'ongoing', label: 'En cours' },
    { value: 'completed', label: 'Terminée' },
];

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
 * Gestion des séries (admin) : toutes les séries en tableau, à trier et à
 * filtrer (« À classer » par défaut). Format, âge et statut se changent dans
 * la ligne ; une ligne changée reste affichée, même si elle sort du filtre.
 */
export const SeriesManagementPage = () => {
    const [params, setParams] = useSearchParams();
    const filter = (params.get('filter') as Filter | null) ?? 'to-classify';
    const sort = (params.get('sort') as SortKey | null) ?? 'name';
    const desc = params.get('dir') === 'desc';
    const formatFilter = params.get('format');
    const statusFilter = params.get('status');
    const [search, setSearch] = useState('');
    const { data, error, reload } = useQuery(fetchManagedSeries, []);
    const formats = useQuery(fetchFormats, []);
    const ages = useAgeSteps();
    // Lignes changées ici : gardées à l'écran.
    const [touched, setTouched] = useState<Set<number>>(new Set());

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
                touched.has(r.id) ||
                (matches(r, filter) &&
                    (!formatFilter ||
                        (formatFilter === 'none'
                            ? !r.formatId
                            : String(r.formatId) === formatFilter)) &&
                    (!statusFilter ||
                        (statusFilter === 'none'
                            ? !r.status
                            : r.status === statusFilter))),
        )
        .filter((r) => !text || genreKey(r.name).includes(text))
        .sort(compareRows(sort, desc));

    /** Enregistre un changement de la ligne, puis recharge la liste. */
    const save = async (id: number, action: () => Promise<unknown>) => {
        setTouched((current) => new Set(current).add(id));
        try {
            await action();
            reload();
        } catch (e) {
            notifications.show({ color: 'red', message: (e as Error).message });
        }
    };

    const formatChoices = (formats.data ?? []).map((f) => ({
        value: String(f.id),
        label: f.name,
    }));

    return (
        <Stack>
            <div>
                <Title order={2}>Séries</Title>
                <Text size="sm" c="dimmed">
                    Format, âge et statut se changent sur chaque carte. Sans
                    âge, une série est masquée aux comptes limités. « Remplir »
                    lance la recherche en ligne dans l’éditeur.
                </Text>
            </div>

            <Group gap="xs">
                {FILTERS.map((f) => (
                    <Button
                        key={f.value}
                        size="compact-sm"
                        radius="xl"
                        fw={400}
                        variant={filter === f.value ? 'filled' : 'default'}
                        aria-pressed={filter === f.value}
                        onClick={() => {
                            setTouched(new Set());
                            update({
                                filter:
                                    f.value === 'to-classify' ? null : f.value,
                            });
                        }}
                    >
                        {f.label} ({counts[f.value]})
                    </Button>
                ))}
            </Group>
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing="xs">
                <TextInput
                    placeholder="Chercher une série"
                    aria-label="Chercher une série"
                    leftSection={<IconSearch size={14} />}
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                />
                <Select
                    aria-label="Format"
                    placeholder="Tous les formats"
                    clearable
                    data={[
                        { value: 'none', label: 'Sans format' },
                        ...formatChoices,
                    ]}
                    value={formatFilter}
                    onChange={(value) => update({ format: value })}
                />
                <Select
                    aria-label="Statut"
                    placeholder="Tous les statuts"
                    clearable
                    data={[
                        { value: 'none', label: 'Sans statut' },
                        ...STATUSES,
                    ]}
                    value={statusFilter}
                    onChange={(value) => update({ status: value })}
                />
                <Group gap={4} wrap="nowrap">
                    <Select
                        aria-label="Trier par"
                        style={{ flex: 1 }}
                        allowDeselect={false}
                        data={SORTS}
                        value={sort}
                        onChange={(value) =>
                            update({ sort: value === 'name' ? null : value })
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
                </Group>
            </SimpleGrid>

            {shown.length === 0 ? (
                <Alert color={filter === 'to-classify' ? 'green' : 'gray'}>
                    {filter === 'to-classify' && !text
                        ? 'Toutes les séries sont classées.'
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
                            <Stack gap="sm">
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
                                                `${s.volumeCount} tome${s.volumeCount > 1 ? 's' : ''}`,
                                                formatSize(s.size),
                                                `${formatSize(s.perVolume)} / tome`,
                                                `${formatSize(s.perPage)} / page`,
                                                s.rating != null &&
                                                    ratingLabel(s.rating),
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
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
                                    </Stack>
                                </Group>
                                <SimpleGrid cols={3} spacing={6}>
                                    <Select
                                        size="xs"
                                        aria-label={`Format de ${s.name}`}
                                        placeholder="Format"
                                        clearable
                                        error={!s.formatId}
                                        data={formatChoices}
                                        value={
                                            s.formatId
                                                ? String(s.formatId)
                                                : null
                                        }
                                        onChange={(value) =>
                                            void save(s.id, () =>
                                                setSeriesClassification(s.id, {
                                                    formatId: value
                                                        ? Number(value)
                                                        : null,
                                                }),
                                            )
                                        }
                                    />
                                    <Select
                                        size="xs"
                                        aria-label={`Âge de ${s.name}`}
                                        // Sans choix : l'âge déduit des fichiers.
                                        placeholder={
                                            s.fileAge !== null
                                                ? `${ageLabel(s.fileAge)} (fichiers)`
                                                : 'Âge'
                                        }
                                        clearable
                                        error={s.effectiveAge === null}
                                        data={ageOptions(ages, s.age)}
                                        value={
                                            s.age === null
                                                ? null
                                                : String(s.age)
                                        }
                                        onChange={(value) =>
                                            void save(s.id, () =>
                                                setSeriesClassification(s.id, {
                                                    age:
                                                        value === null
                                                            ? null
                                                            : Number(value),
                                                }),
                                            )
                                        }
                                    />
                                    <Select
                                        size="xs"
                                        aria-label={`Statut de ${s.name}`}
                                        placeholder="Statut"
                                        clearable
                                        data={STATUSES}
                                        value={s.status}
                                        onChange={(value) =>
                                            void save(s.id, () =>
                                                setSeriesStatus(
                                                    s.id,
                                                    value as
                                                        | 'ongoing'
                                                        | 'completed'
                                                        | null,
                                                ),
                                            )
                                        }
                                    />
                                </SimpleGrid>
                                <Group justify="space-between" wrap="nowrap">
                                    <CompletenessBadge
                                        completeness={{
                                            percent: s.percent,
                                            missing: s.missing,
                                        }}
                                    />
                                    <Group gap={6} wrap="nowrap">
                                        <Button
                                            component={Link}
                                            to={`/series/${s.id}/edit?fill=online&from=to-classify`}
                                            size="compact-sm"
                                            variant="light"
                                            leftSection={<IconWand size={14} />}
                                            aria-label={`Remplir ${s.name}`}
                                        >
                                            Remplir
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
