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
    Menu,
    Paper,
    Popover,
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
    IconCheck,
    IconFilter,
    IconPencil,
    IconSearch,
    IconSortAscending,
    IconSortDescending,
    IconWand,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import {
    SOURCE_LABELS,
    compareNames,
    genreKey,
    sourceUrl,
} from '@server/types';

import { CompletenessBadge } from '@/components/CompletenessBadge';
import { ageLabel } from '@/components/ageLimits';
import {
    formatSize,
    missingVolumesLabel,
    publishedLabel,
    ratingLabel,
} from '@/components/format';
import {
    type ManagedSeries,
    answerSheetProposal,
    fetchFormats,
    fetchManagedSeries,
    seriesCoverUrl,
    setVolumeCountSite,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Filtres (bouton « Filtres ») ; toutes les séries par défaut. */
const FILTERS = [
    { value: 'all', label: 'Toutes' },
    { value: 'to-classify', label: 'À classer' },
    { value: 'no-summary', label: 'Sans résumé' },
    { value: 'no-genre', label: 'Sans genre' },
    { value: 'incomplete', label: 'Fiche < 80 %' },
    // Numéros absents de Bento (trous, ou tomes parus d'après les fiches).
    { value: 'missing-volumes', label: 'Tomes manquants' },
    // Fiches changées en ligne (mise à jour de nuit).
    { value: 'to-review', label: 'Fiches à revoir' },
    // Fiches trouvées la nuit pour une série qui n'en avait pas.
    { value: 'proposed', label: 'Fiches proposées' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

/**
 * Fiches en ligne liées : aucune, ou pas celle d'un site (Manga-news : les
 * mangas seulement, il n'a pas les BD).
 */
const SHEET_FILTERS = [
    { value: 'none', label: 'Aucune fiche' },
    { value: 'manga-news', label: 'Sans Manga-news (mangas)' },
    { value: 'bedetheque', label: 'Sans Bedetheque' },
    { value: 'wikipedia', label: 'Sans Wikipédia' },
] as const;
type SheetFilter = (typeof SHEET_FILTERS)[number]['value'];

const matchesSheets = (
    row: Pick<ManagedSeries, 'sheetSites' | 'libraryType'>,
    filter: SheetFilter,
) =>
    filter === 'none'
        ? row.sheetSites.length === 0
        : filter === 'manga-news'
          ? row.libraryType === 'manga' && !row.sheetSites.includes(filter)
          : !row.sheetSites.includes(filter);

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
    // Calculée par le serveur, comme l'éditeur et la fiche série.
    const { percent, missing } = s.completeness;
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
        case 'proposed':
            return row.proposals.length > 0;
        case 'missing-volumes':
            return row.volumesStatus.missing.length > 0;
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
 * Tomes manquants (ou fiches en désaccord sur le nombre de tomes parus),
 * et le choix de la fiche qui donne ce nombre : automatique (la plus proche
 * des tomes de Bento), ou celle d'un site.
 */
const VolumesCountLine = ({
    seriesId,
    status,
    onChanged,
}: {
    seriesId: number;
    status: ManagedSeries['volumesStatus'];
    onChanged: () => void;
}) => {
    const counts = status.published ? [status.published, ...status.others] : [];
    const choosable = counts.length > 1 || status.chosen !== null;
    if (status.missing.length === 0 && !choosable) return null;
    const choose = async (site: 'manga-news' | 'bedetheque' | null) => {
        try {
            await setVolumeCountSite(seriesId, site);
            onChanged();
        } catch (e) {
            notifications.show({ color: 'red', message: (e as Error).message });
        }
    };
    return (
        <Group gap={6} wrap="nowrap" align="flex-start">
            <Text
                size="xs"
                c={status.missing.length > 0 ? 'orange' : 'dimmed'}
                lineClamp={2}
            >
                {status.missing.length > 0
                    ? missingVolumesLabel(status)
                    : publishedLabel(status)}
            </Text>
            {choosable && (
                <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                        <Anchor
                            component="button"
                            size="xs"
                            style={{ flexShrink: 0 }}
                            aria-label="Fiche qui donne le nombre de tomes"
                        >
                            Changer
                        </Anchor>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Nombre de tomes parus</Menu.Label>
                        <Menu.Item
                            leftSection={
                                status.chosen === null ? (
                                    <IconCheck size={14} />
                                ) : (
                                    <span style={{ width: 14 }} />
                                )
                            }
                            onClick={() => void choose(null)}
                        >
                            Automatique (la plus proche)
                        </Menu.Item>
                        {counts.map((count) => (
                            <Menu.Item
                                key={count.site}
                                leftSection={
                                    status.chosen === count.site ? (
                                        <IconCheck size={14} />
                                    ) : (
                                        <span style={{ width: 14 }} />
                                    )
                                }
                                onClick={() => void choose(count.site)}
                            >
                                {SOURCE_LABELS[count.site]} : {count.count}
                            </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>
            )}
        </Group>
    );
};

/** Ce que dit une fiche proposée : auteurs, tomes, année, même auteur. */
const proposalDetails = ({ details }: ManagedSeries['proposals'][number]) =>
    [
        details.writer,
        details.penciller !== details.writer && details.penciller,
        details.publisher,
        details.volumeCount &&
            `${details.volumeCount} tome${details.volumeCount > 1 ? 's' : ''}`,
        details.year && `depuis ${details.year}`,
        details.sameAuthor === true
            ? 'même auteur'
            : details.sameAuthor === false
              ? 'autre auteur'
              : null,
    ]
        .filter(Boolean)
        .join(' · ');

/**
 * Fiche trouvée la nuit pour la série : son site, son nom (lien vers la
 * fiche), ce qu'elle dit, et « Lier » ou « Ce n'est pas elle ».
 */
const ProposalLine = ({
    seriesId,
    proposal,
    onAnswered,
}: {
    seriesId: number;
    proposal: ManagedSeries['proposals'][number];
    onAnswered: () => void;
}) => {
    const [busy, setBusy] = useState(false);
    const answer = async (accept: boolean) => {
        setBusy(true);
        try {
            await answerSheetProposal(seriesId, proposal, accept);
            onAnswered();
        } catch (e) {
            notifications.show({ color: 'red', message: (e as Error).message });
            setBusy(false);
        }
    };
    return (
        <Paper withBorder radius="sm" p={8} data-testid="proposal">
            <Stack gap={4}>
                <Text size="xs">
                    Fiche {SOURCE_LABELS[proposal.site]} proposée :{' '}
                    <Anchor
                        href={sourceUrl({
                            site: proposal.site,
                            id: proposal.id,
                        })}
                        target="_blank"
                        size="xs"
                    >
                        {proposal.title}
                    </Anchor>
                </Text>
                <Text size="xs" c="dimmed">
                    {proposalDetails(proposal)}
                </Text>
                <Group gap={6}>
                    <Button
                        size="compact-xs"
                        variant="light"
                        disabled={busy}
                        onClick={() => void answer(true)}
                    >
                        Lier
                    </Button>
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        disabled={busy}
                        onClick={() => void answer(false)}
                    >
                        Ce n’est pas elle
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
};

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
    const sheetFilter = params.get('sheet') as SheetFilter | null;
    const [search, setSearch] = useState('');
    const { data, error, reload } = useQuery(fetchManagedSeries, []);
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
                        : r.status === statusFilter)) &&
                (!sheetFilter || matchesSheets(r, sheetFilter)),
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
        (statusFilter ? 1 : 0) +
        (sheetFilter ? 1 : 0);
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
                                <Select
                                    label="Fiches en ligne"
                                    placeholder="Toutes"
                                    clearable
                                    comboboxProps={{ withinPortal: false }}
                                    data={SHEET_FILTERS.map((f) => ({
                                        value: f.value,
                                        label: `${f.label} (${rows.filter((r) => matchesSheets(r, f.value)).length})`,
                                    }))}
                                    value={sheetFilter}
                                    onChange={(value) =>
                                        update({ sheet: value })
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
                        {counts.proposed > 0 && filter !== 'proposed' && (
                            <Anchor
                                component="button"
                                size="xs"
                                onClick={() => chooseFilter('proposed')}
                            >
                                {counts.proposed} série
                                {counts.proposed > 1 ? 's' : ''} avec une fiche
                                proposée
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
                                        <VolumesCountLine
                                            seriesId={s.id}
                                            status={s.volumesStatus}
                                            onChanged={reload}
                                        />
                                        {/* Fiches en ligne liées. */}
                                        <Text size="xs" c="dimmed">
                                            {s.sheetSites.length
                                                ? `Fiches : ${s.sheetSites.map((site) => SOURCE_LABELS[site]).join(' · ')}`
                                                : 'Aucune fiche en ligne'}
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
                                {/* Fiches trouvées la nuit : liées
                                    seulement par l'admin. */}
                                {s.proposals.map((proposal) => (
                                    <ProposalLine
                                        key={`${proposal.site}:${proposal.id}`}
                                        seriesId={s.id}
                                        proposal={proposal}
                                        onAnswered={reload}
                                    />
                                ))}
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
