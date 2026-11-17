import {
    ActionIcon,
    Alert,
    Anchor,
    Badge,
    Button,
    Checkbox,
    Group,
    Image,
    Indicator,
    Menu,
    Paper,
    Popover,
    Select,
    Stack,
    Tabs,
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
    IconPlayerPlayFilled,
    IconSearch,
    IconSortAscending,
    IconSortDescending,
    IconWand,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import {
    SOURCE_LABELS,
    compareNames,
    genreKey,
    sourceUrl,
} from '@server/types';

import { CompletenessBadge } from '@/components/CompletenessBadge';
import { PageLoader } from '@/components/PageLoader';
import { ageLabel, useAgeSteps } from '@/components/ageLimits';
import {
    formatSize,
    missingVolumesLabel,
    publishedLabel,
    ratingLabel,
} from '@/components/format';
import { saveManageQueue } from '@/components/manageQueue';
import {
    type ManagedSeries,
    answerSheetProposal,
    fetchFormats,
    fetchManagedSeries,
    seriesCoverUrl,
    setSeriesClassification,
    setSeriesStatus,
    setVolumeCountSite,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Filtres fins de l'onglet « Toutes » (bouton « Filtres »). */
const FILTERS = [
    { value: 'all', label: 'Toutes' },
    { value: 'to-classify', label: 'À classer' },
    { value: 'no-summary', label: 'Sans résumé' },
    { value: 'no-genre', label: 'Sans genre' },
] as const;
// Plus ceux des onglets (et des anciennes adresses).
type Filter =
    | (typeof FILTERS)[number]['value']
    | 'incomplete'
    | 'missing-volumes'
    | 'to-review'
    | 'proposed';

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

/** Onglets : chacun une file de séries à traiter, puis toutes. */
const TABS = [
    { value: 'todo', label: 'À compléter' },
    { value: 'missing', label: 'Tomes manquants' },
    { value: 'review', label: 'Fiches à revoir' },
    { value: 'proposed', label: 'Fiches proposées' },
    { value: 'all', label: 'Toutes' },
] as const;
type Tab = (typeof TABS)[number]['value'];

const inTab = (row: Row, tab: Tab) => {
    switch (tab) {
        case 'todo':
            // Fiche incomplète, ou série sans format ni âge (cachée aux
            // comptes limités).
            return matches(row, 'incomplete') || matches(row, 'to-classify');
        case 'missing':
            return matches(row, 'missing-volumes');
        case 'review':
            return matches(row, 'to-review');
        case 'proposed':
            return matches(row, 'proposed');
        default:
            return true;
    }
};

// Anciennes adresses (`?filter=to-review`) : l'onglet qui les remplace.
const LEGACY_TABS: Partial<Record<Filter, Tab>> = {
    incomplete: 'todo',
    'missing-volumes': 'missing',
    'to-review': 'review',
    proposed: 'proposed',
};

/** Actions sur plusieurs séries : format, âge, parution. */
const BulkBar = ({
    selected,
    formats,
    onDone,
}: {
    selected: Row[];
    formats: { id: number; name: string }[];
    onDone: () => void;
}) => {
    const ages = useAgeSteps();
    const [busy, setBusy] = useState(false);
    const apply = async (
        label: string,
        action: (row: Row) => Promise<unknown>,
    ) => {
        setBusy(true);
        try {
            await Promise.all(selected.map(action));
            notifications.show({
                message: `${label} : ${selected.length} série${selected.length > 1 ? 's' : ''} modifiée${selected.length > 1 ? 's' : ''}.`,
            });
            onDone();
        } catch (e) {
            notifications.show({ color: 'red', message: (e as Error).message });
        } finally {
            setBusy(false);
        }
    };
    const menu = (
        label: string,
        items: { label: string; run: () => void }[],
    ) => (
        <Menu position="top" withinPortal>
            <Menu.Target>
                <Button
                    size="compact-md"
                    variant="default"
                    disabled={selected.length === 0 || busy}
                >
                    {label}
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                {items.map((item) => (
                    <Menu.Item key={item.label} onClick={item.run}>
                        {item.label}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
    return (
        <Paper
            withBorder
            shadow="md"
            radius="md"
            p="sm"
            style={{
                position: 'sticky',
                bottom: 'calc(var(--app-shell-footer-offset, 0px) + 12px)',
                zIndex: 20,
            }}
        >
            <Group gap="sm" justify="space-between">
                <Text size="sm" fw={500}>
                    {selected.length
                        ? `${selected.length} série${selected.length > 1 ? 's' : ''} sélectionnée${selected.length > 1 ? 's' : ''}`
                        : 'Coche les séries à modifier'}
                </Text>
                <Group gap={6}>
                    {menu(
                        'Format',
                        formats.map((format) => ({
                            label: format.name,
                            run: () =>
                                void apply(`Format ${format.name}`, (row) =>
                                    setSeriesClassification(row.id, {
                                        formatId: format.id,
                                    }),
                                ),
                        })),
                    )}
                    {menu(
                        'Âge',
                        ages.map((age) => ({
                            label: ageLabel(age),
                            run: () =>
                                void apply(ageLabel(age), (row) =>
                                    setSeriesClassification(row.id, { age }),
                                ),
                        })),
                    )}
                    {menu(
                        'Parution',
                        STATUSES.map((status) => ({
                            label: status.label,
                            run: () =>
                                void apply(status.label, (row) =>
                                    setSeriesStatus(
                                        row.id,
                                        status.value as 'ongoing' | 'completed',
                                    ),
                                ),
                        })),
                    )}
                </Group>
            </Group>
        </Paper>
    );
};

/** Une série de la liste : ce qu'il faut savoir, et quoi faire. */
const SeriesRow = ({
    s,
    selecting,
    selected,
    onSelect,
    onOpen,
    reload,
}: {
    s: Row;
    selecting: boolean;
    selected: boolean;
    onSelect: (checked: boolean) => void;
    /** Avant d'ouvrir l'éditeur : la liste, pour « Suivante ». */
    onOpen: () => void;
    reload: () => void;
}) => (
    <Group
        gap="sm"
        wrap="nowrap"
        align="flex-start"
        p="sm"
        data-testid="managed-card"
        bg={selected ? 'var(--mantine-primary-color-light)' : undefined}
        style={{
            borderTop: '1px solid var(--mantine-color-default-border)',
        }}
    >
        {selecting && (
            <Checkbox
                mt={4}
                checked={selected}
                onChange={(event) => onSelect(event.currentTarget.checked)}
                aria-label={`Sélectionner ${s.name}`}
            />
        )}
        <Image
            src={seriesCoverUrl(s, 'small')}
            w={44}
            h={66}
            fit="cover"
            radius="sm"
            alt=""
            loading="lazy"
            style={{ flexShrink: 0 }}
        />
        <Group
            gap="sm"
            align="flex-start"
            style={{ flex: 1, minWidth: 0 }}
            wrap="wrap"
        >
            <Stack gap={2} style={{ flex: '1 1 300px', minWidth: 0 }}>
                <Group gap="xs" wrap="nowrap">
                    <Anchor
                        component={Link}
                        to={`/series/${s.id}`}
                        fw={500}
                        lineClamp={1}
                    >
                        {s.name}
                    </Anchor>
                </Group>
                <Text size="xs" c="dimmed">
                    {[
                        s.format ?? 'Sans format',
                        s.effectiveAge !== null && ageLabel(s.effectiveAge),
                        s.status && STATUS_LABELS[s.status],
                        s.rating != null && ratingLabel(s.rating),
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
                        s.lastAddedAt && `ajout ${formatDay(s.lastAddedAt)}`,
                    ]
                        .filter(Boolean)
                        .join(' · ')}
                </Text>
                <Text size="xs" c="dimmed">
                    {s.sheetSites.length
                        ? `Fiches : ${s.sheetSites.map((site) => SOURCE_LABELS[site]).join(' · ')}`
                        : 'Aucune fiche en ligne'}
                </Text>
                <VolumesCountLine
                    seriesId={s.id}
                    status={s.volumesStatus}
                    onChanged={reload}
                />
                {/* Changé sur le site depuis la dernière visite : rien
                    d'appliqué, à revoir. */}
                {s.sheetChanges.length > 0 && (
                    <Text size="xs" c="orange">
                        Fiche à revoir : {s.sheetChanges.join(' · ')}
                    </Text>
                )}
                {/* Fiches trouvées la nuit : liées seulement par l'admin. */}
                {s.proposals.map((proposal) => (
                    <ProposalLine
                        key={`${proposal.site}:${proposal.id}`}
                        seriesId={s.id}
                        proposal={proposal}
                        onAnswered={reload}
                    />
                ))}
            </Stack>
            <Stack gap={6} align="flex-end" style={{ flexShrink: 0 }}>
                {/* Ce qui manque, dans la bulle : sans avoir à l'ouvrir. */}
                <CompletenessBadge
                    withMissing
                    completeness={{ percent: s.percent, missing: s.missing }}
                />
                <Group gap={6} wrap="nowrap">
                    <Button
                        component={Link}
                        to={`/series/${s.id}/edit?fill=online&from=manage`}
                        onClick={onOpen}
                        size="compact-sm"
                        variant="light"
                        leftSection={<IconWand size={14} />}
                        color={s.sheetChanges.length > 0 ? 'orange' : undefined}
                        aria-label={`${s.sheetChanges.length > 0 ? 'Revoir' : 'Remplir'} ${s.name}`}
                    >
                        {s.sheetChanges.length > 0 ? 'Revoir' : 'Remplir'}
                    </Button>
                    <Button
                        component={Link}
                        to={`/series/${s.id}/edit?from=manage`}
                        onClick={onOpen}
                        size="compact-sm"
                        variant="default"
                        leftSection={<IconPencil size={14} />}
                        aria-label={`Modifier ${s.name}`}
                    >
                        Modifier
                    </Button>
                </Group>
            </Stack>
        </Group>
    </Group>
);

/**
 * Séries (admin) : une liste de travail. Chaque onglet est une file de
 * séries à traiter (fiches à compléter, tomes manquants, fiches à revoir
 * ou proposées), avec son nombre ; « Traiter » les enchaîne dans
 * l'éditeur. « Toutes » garde les filtres fins. « Sélectionner » change le
 * format, l'âge ou la parution de plusieurs séries à la fois.
 */
export const SeriesManagementPage = () => {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const legacy = params.get('filter') as Filter | null;
    const tabParam = params.get('tab');
    // Onglet de l'adresse (ou d'une ancienne adresse) ; sinon le premier
    // qui a du travail, une fois la liste là.
    const requested: Tab | null =
        TABS.find((t) => t.value === tabParam)?.value ??
        (legacy && LEGACY_TABS[legacy]) ??
        (legacy ? 'all' : null);
    // Les fiches les moins complètes d'abord.
    const sort = (params.get('sort') as SortKey | null) ?? 'completeness';
    const desc = params.get('dir') === 'desc';
    const formatFilter = params.get('format');
    const statusFilter = params.get('status');
    const sheetFilter = params.get('sheet') as SheetFilter | null;
    const [search, setSearch] = useState('');
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());
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
    if (!data) return <PageLoader />;

    const rows = data.map(toRow);
    const counts = Object.fromEntries(
        TABS.map((t) => [
            t.value,
            rows.filter((r) => inTab(r, t.value)).length,
        ]),
    );
    const tab: Tab =
        requested ??
        TABS.find((t) => t.value !== 'all' && counts[t.value]! > 0)?.value ??
        'all';
    // Filtre fin de « Toutes » (à classer, sans résumé, sans genre).
    const filter: Filter = tab === 'all' && legacy ? legacy : 'all';
    const text = genreKey(search);
    const fine = tab === 'all';
    const shown = rows
        .filter(
            (r) =>
                inTab(r, tab) &&
                (!fine ||
                    (matches(r, filter) &&
                        (!formatFilter ||
                            (formatFilter === 'none'
                                ? !r.formatId
                                : String(r.formatId) === formatFilter)) &&
                        (!statusFilter ||
                            (statusFilter === 'none'
                                ? !r.status
                                : r.status === statusFilter)) &&
                        (!sheetFilter || matchesSheets(r, sheetFilter)))),
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
    // Série ouverte : l'éditeur suit cette liste (« Suivante », retour).
    const rememberList = () =>
        saveManageQueue({
            items: shown.map((s) => ({ id: s.id, name: s.name })),
            search: params.toString(),
        });
    // « Traiter » : la première série de l'onglet dans l'éditeur, les
    // autres ensuite par « Suivante ».
    const processAll = () => {
        const first = shown[0];
        if (!first) return;
        rememberList();
        void navigate(
            `/series/${first.id}/edit?${tab === 'missing' ? '' : 'fill=online&'}from=manage`,
        );
    };
    const chooseTab = (value: Tab) => {
        setSelected(new Set());
        update({
            tab: value,
            filter: null,
            format: null,
            status: null,
            sheet: null,
        });
    };
    const selectedRows = shown.filter((r) => selected.has(r.id));

    return (
        <Stack gap="sm">
            <div>
                <Title order={2}>Séries</Title>
                <Text size="sm" c="dimmed">
                    Chaque onglet est une file de séries à traiter. Sans âge,
                    une série est masquée aux comptes limités.
                </Text>
            </div>

            <Tabs
                value={tab}
                onChange={(value) => value && chooseTab(value as Tab)}
            >
                <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
                    {TABS.map((t) => (
                        <Tabs.Tab
                            key={t.value}
                            value={t.value}
                            rightSection={
                                <Badge
                                    size="sm"
                                    circle={counts[t.value]! < 100}
                                    variant={
                                        tab === t.value ? 'filled' : 'light'
                                    }
                                    color={
                                        counts[t.value] === 0
                                            ? 'gray'
                                            : undefined
                                    }
                                >
                                    {counts[t.value]}
                                </Badge>
                            }
                            style={{ flexShrink: 0 }}
                        >
                            {t.label}
                        </Tabs.Tab>
                    ))}
                </Tabs.List>
            </Tabs>

            {/* Outils : toujours visibles en haut (sous l'en-tête). */}
            <Group
                gap={6}
                wrap="nowrap"
                py={8}
                style={{
                    position: 'sticky',
                    top: 'var(--app-shell-header-height, 56px)',
                    zIndex: 10,
                    background: 'var(--mantine-color-body)',
                }}
            >
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
                    w={{ base: 110, sm: 170 }}
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
                        onClick={() => update({ dir: desc ? null : 'desc' })}
                    >
                        {desc ? (
                            <IconSortDescending size={18} />
                        ) : (
                            <IconSortAscending size={18} />
                        )}
                    </ActionIcon>
                </Tooltip>
                {/* Filtres fins : dans « Toutes » seulement. */}
                {fine && (
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
                                        label: `${f.label} (${rows.filter((r) => matches(r, f.value)).length})`,
                                    }))}
                                    value={filter}
                                    onChange={(value) =>
                                        update({
                                            filter:
                                                value === 'all' ? null : value,
                                        })
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
                )}
            </Group>

            <Group justify="space-between" gap="xs">
                <Group gap="sm">
                    {tab !== 'all' &&
                        tab !== 'proposed' &&
                        shown.length > 0 && (
                            <Button
                                size="compact-md"
                                leftSection={<IconPlayerPlayFilled size={14} />}
                                onClick={processAll}
                            >
                                Traiter les {shown.length}
                            </Button>
                        )}
                    <Text size="xs" c="dimmed">
                        {shown.length} série{shown.length > 1 ? 's' : ''}
                    </Text>
                    {fine && extraFilters > 0 && (
                        <Anchor
                            component="button"
                            size="xs"
                            onClick={() =>
                                update({
                                    filter: null,
                                    format: null,
                                    status: null,
                                    sheet: null,
                                })
                            }
                        >
                            Voir toutes
                        </Anchor>
                    )}
                </Group>
                <Group gap={6}>
                    {selecting && (
                        <Checkbox
                            size="xs"
                            label="Tout"
                            checked={
                                shown.length > 0 &&
                                selectedRows.length === shown.length
                            }
                            indeterminate={
                                selectedRows.length > 0 &&
                                selectedRows.length < shown.length
                            }
                            onChange={(event) =>
                                setSelected(
                                    event.currentTarget.checked
                                        ? new Set(shown.map((r) => r.id))
                                        : new Set(),
                                )
                            }
                        />
                    )}
                    {(selecting || shown.length > 0) && (
                        <Button
                            size="compact-sm"
                            variant={selecting ? 'light' : 'default'}
                            onClick={() => {
                                setSelecting(!selecting);
                                setSelected(new Set());
                            }}
                        >
                            {selecting ? 'Terminer' : 'Sélectionner'}
                        </Button>
                    )}
                </Group>
            </Group>

            {shown.length === 0 ? (
                <Alert color="gray">
                    {text
                        ? 'Aucune série.'
                        : tab === 'all'
                          ? 'Aucune série dans ce filtre.'
                          : 'Rien à faire ici.'}
                </Alert>
            ) : (
                <Paper
                    withBorder
                    radius="md"
                    style={{ overflow: 'hidden' }}
                    data-testid="managed-series"
                >
                    {/* La bordure du haut de chaque ligne les sépare. */}
                    <div style={{ marginTop: -1 }}>
                        {shown.map((s) => (
                            <SeriesRow
                                key={s.id}
                                s={s}
                                selecting={selecting}
                                selected={selected.has(s.id)}
                                onSelect={(checked) =>
                                    setSelected((current) => {
                                        const next = new Set(current);
                                        if (checked) next.add(s.id);
                                        else next.delete(s.id);
                                        return next;
                                    })
                                }
                                onOpen={rememberList}
                                reload={reload}
                            />
                        ))}
                    </div>
                </Paper>
            )}
            {selecting && (
                <BulkBar
                    selected={selectedRows}
                    formats={formats.data ?? []}
                    onDone={() => {
                        setSelected(new Set());
                        reload();
                    }}
                />
            )}
        </Stack>
    );
};
