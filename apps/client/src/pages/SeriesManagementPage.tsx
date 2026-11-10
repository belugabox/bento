import {
    ActionIcon,
    Alert,
    Anchor,
    Button,
    Group,
    Image,
    Loader,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconChevronDown,
    IconChevronUp,
    IconPencil,
    IconSearch,
    IconSelector,
    IconWand,
} from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { compareNames, genreKey } from '@server/types';

import { CompletenessBadge } from '@/components/CompletenessBadge';
import { ageLabel, ageOptions, useAgeSteps } from '@/components/ageLimits';
import { completenessOf } from '@/components/completeness';
import { formatSize } from '@/components/format';
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
    | 'added';

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

/** En-tête de colonne cliquable : trie, puis inverse le sens. */
const SortHeader = ({
    column,
    sort,
    desc,
    onSort,
    children,
    align,
}: {
    column: SortKey;
    sort: SortKey;
    desc: boolean;
    onSort: (column: SortKey) => void;
    children: ReactNode;
    align?: 'right';
}) => {
    const Icon =
        sort !== column ? IconSelector : desc ? IconChevronDown : IconChevronUp;
    return (
        <Table.Th ta={align}>
            <UnstyledButton
                onClick={() => onSort(column)}
                aria-label={`Trier par ${String(children).toLowerCase()}`}
            >
                <Group
                    gap={4}
                    wrap="nowrap"
                    justify={align === 'right' ? 'flex-end' : undefined}
                >
                    <Text size="sm" fw={600}>
                        {children}
                    </Text>
                    <Icon size={14} opacity={sort === column ? 1 : 0.4} />
                </Group>
            </UnstyledButton>
        </Table.Th>
    );
};

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

    const onSort = (column: SortKey) =>
        update({
            sort: column === 'name' ? null : column,
            dir: column === sort && !desc ? 'desc' : null,
        });

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
    const sortProps = { sort, desc, onSort };

    return (
        <Stack>
            <div>
                <Title order={2}>Séries</Title>
                <Text size="sm" c="dimmed">
                    Format, âge et statut se changent dans le tableau. Sans âge,
                    une série est masquée aux comptes limités. « Remplir » lance
                    la recherche en ligne dans l’éditeur.
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
            <Group gap="xs" align="flex-end">
                <TextInput
                    placeholder="Chercher une série"
                    aria-label="Chercher une série"
                    leftSection={<IconSearch size={14} />}
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                    w={220}
                />
                <Select
                    aria-label="Format"
                    placeholder="Tous les formats"
                    clearable
                    w={180}
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
                    w={180}
                    data={[
                        { value: 'none', label: 'Sans statut' },
                        ...STATUSES,
                    ]}
                    value={statusFilter}
                    onChange={(value) => update({ status: value })}
                />
            </Group>

            {shown.length === 0 ? (
                <Alert color={filter === 'to-classify' ? 'green' : 'gray'}>
                    {filter === 'to-classify' && !text
                        ? 'Toutes les séries sont classées.'
                        : 'Aucune série dans ce filtre.'}
                </Alert>
            ) : (
                <Table.ScrollContainer minWidth={1180}>
                    <Table verticalSpacing={6} highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th w={44} />
                                <SortHeader column="name" {...sortProps}>
                                    Série
                                </SortHeader>
                                <SortHeader column="format" {...sortProps}>
                                    Format
                                </SortHeader>
                                <SortHeader column="age" {...sortProps}>
                                    Âge
                                </SortHeader>
                                <SortHeader column="status" {...sortProps}>
                                    Statut
                                </SortHeader>
                                <Table.Th>Genres</Table.Th>
                                <SortHeader
                                    column="completeness"
                                    {...sortProps}
                                >
                                    Fiche
                                </SortHeader>
                                <SortHeader
                                    column="volumes"
                                    align="right"
                                    {...sortProps}
                                >
                                    Tomes
                                </SortHeader>
                                <SortHeader
                                    column="size"
                                    align="right"
                                    {...sortProps}
                                >
                                    Taille
                                </SortHeader>
                                <SortHeader
                                    column="perPage"
                                    align="right"
                                    {...sortProps}
                                >
                                    Moyenne
                                </SortHeader>
                                <SortHeader column="added" {...sortProps}>
                                    Ajout
                                </SortHeader>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {shown.map((s) => (
                                <Table.Tr key={s.id}>
                                    <Table.Td>
                                        <Image
                                            src={seriesCoverUrl(s, 'small')}
                                            w={32}
                                            h={48}
                                            fit="cover"
                                            radius="xs"
                                            alt=""
                                            loading="lazy"
                                        />
                                    </Table.Td>
                                    <Table.Td maw={240}>
                                        <Anchor
                                            component={Link}
                                            to={`/series/${s.id}`}
                                            size="sm"
                                            lineClamp={2}
                                        >
                                            {s.name}
                                        </Anchor>
                                    </Table.Td>
                                    <Table.Td>
                                        <Select
                                            size="xs"
                                            w={130}
                                            aria-label={`Format de ${s.name}`}
                                            placeholder="—"
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
                                                    setSeriesClassification(
                                                        s.id,
                                                        {
                                                            formatId: value
                                                                ? Number(value)
                                                                : null,
                                                        },
                                                    ),
                                                )
                                            }
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <Select
                                            size="xs"
                                            w={130}
                                            aria-label={`Âge de ${s.name}`}
                                            // Sans choix : l'âge déduit des fichiers.
                                            placeholder={
                                                s.fileAge !== null
                                                    ? `${ageLabel(s.fileAge)} (fichiers)`
                                                    : '—'
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
                                                    setSeriesClassification(
                                                        s.id,
                                                        {
                                                            age:
                                                                value === null
                                                                    ? null
                                                                    : Number(
                                                                          value,
                                                                      ),
                                                        },
                                                    ),
                                                )
                                            }
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <Select
                                            size="xs"
                                            w={120}
                                            aria-label={`Statut de ${s.name}`}
                                            placeholder="—"
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
                                    </Table.Td>
                                    <Table.Td maw={180}>
                                        <Text
                                            size="xs"
                                            c="dimmed"
                                            lineClamp={2}
                                        >
                                            {s.genres.join(', ') || '—'}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <CompletenessBadge
                                            completeness={{
                                                percent: s.percent,
                                                missing: s.missing,
                                            }}
                                            short
                                        />
                                    </Table.Td>
                                    <Table.Td ta="right">
                                        <Text size="sm">{s.volumeCount}</Text>
                                    </Table.Td>
                                    <Table.Td ta="right">
                                        <Text
                                            size="sm"
                                            style={{ whiteSpace: 'nowrap' }}
                                        >
                                            {formatSize(s.size)}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td ta="right">
                                        <Text
                                            size="xs"
                                            style={{ whiteSpace: 'nowrap' }}
                                        >
                                            {formatSize(s.perVolume)} / tome
                                        </Text>
                                        <Text
                                            size="xs"
                                            c="dimmed"
                                            style={{ whiteSpace: 'nowrap' }}
                                        >
                                            {formatSize(s.perPage)} / page
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text
                                            size="xs"
                                            c="dimmed"
                                            style={{ whiteSpace: 'nowrap' }}
                                        >
                                            {formatDay(s.lastAddedAt)}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group
                                            gap={4}
                                            wrap="nowrap"
                                            justify="flex-end"
                                        >
                                            <Tooltip label="Remplir en ligne">
                                                <ActionIcon
                                                    component={Link}
                                                    to={`/series/${s.id}/edit?fill=online&from=to-classify`}
                                                    variant="light"
                                                    aria-label={`Remplir ${s.name}`}
                                                >
                                                    <IconWand size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Modifier">
                                                <ActionIcon
                                                    component={Link}
                                                    to={`/series/${s.id}/edit?from=to-classify`}
                                                    variant="default"
                                                    aria-label={`Modifier ${s.name}`}
                                                >
                                                    <IconPencil size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
        </Stack>
    );
};
