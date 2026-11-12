import {
    ActionIcon,
    Alert,
    Anchor,
    Button,
    Checkbox,
    CloseButton,
    Grid,
    Group,
    Image,
    NumberInput,
    Paper,
    Popover,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Textarea,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowBackUp,
    IconArrowRight,
    IconEye,
    IconFileText,
    IconFileZip,
    IconPhoto,
    IconRefresh,
    IconUpload,
    IconWand,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
    type ComicInfo,
    DEFAULT_SOURCE_PRIORITY,
    SOURCE_LABELS,
    type SheetField,
    type SourceLink,
    VOLUME_KINDS,
    VOLUME_KIND_LABELS,
    type VolumeKind,
    classify,
    publicationPathOf,
    sourceUrl,
} from '@server/types';

import { CompletenessBadge } from '@/components/CompletenessBadge';
import {
    ageLabel,
    ageOfRating,
    ageOptions,
    ratingForAge,
    useAgeSteps,
} from '@/components/ageLimits';
import { completenessOf, fieldsFromVolumes } from '@/components/completeness';
import { formatSize } from '@/components/format';
import { volumeCountLabel } from '@/components/readingStatus';
import { ReaderPreview } from '@/reader/ReaderPreview';
import {
    READING_MODES,
    type ReadingMode,
    readingModeLabel,
} from '@/reader/navigation';
import {
    type ClassificationChanges,
    fetchCredits,
    fetchFilePageSizes,
    fetchFormats,
    fetchGenres,
    fetchSettings,
    filePageUrl,
    publishFiles,
    saveComicInfo,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

import { CompressionModal } from './CompressionModal';
import { CreditInput } from './CreditInput';
import { ExistingSeriesPicker } from './ExistingSeriesPicker';
import { GenreFields } from './GenreFields';
import { SeriesSearch } from './SeriesSearch';
import { SheetComparison } from './SheetComparison';
import {
    type EditableVolume,
    type Edits,
    type SeriesField,
    type SeriesStatus,
    type SheetValues,
    applySheetValues,
    changesOf,
    editedValues,
    fillFromFileNames,
    initialEdits,
    isFieldChanged,
    isMixed,
    isSeriesFieldChanged,
    joinSeries,
    revertSeriesField,
    searchNameOf,
    seriesValue,
    setSeriesField,
    setVolumeField,
    setVolumeKind,
    volumeKindOf,
} from './editing';
import { type FoundSeries, loadFound, sitesFor } from './onlineSheets';

export type EditorVolume = EditableVolume & {
    /** Adresse de la couverture du tome. */
    cover: string | null;
    error?: string | null;
    /** Nombre de pages (aperçu de lecture). */
    pageCount?: number;
    /** Taille du fichier, en octets (taille totale de la série). */
    size?: number;
};

type Report = { color: string; lines: string[] };

/** Valeur d'origine d'un champ modifié, et comment y revenir. */
type Revert = { original: string; onRevert: () => void };

// Un long résumé n'est montré qu'en partie dans la bulle.
const ORIGINAL_PREVIEW = 300;

/** Bouton dans un champ modifié : montre sa valeur d'origine, et y revient. */
const RevertButton = ({ original, onRevert }: Revert) => {
    const [opened, { toggle, close }] = useDisclosure(false);
    const shown =
        original.length > ORIGINAL_PREVIEW
            ? `${original.slice(0, ORIGINAL_PREVIEW)}…`
            : original || '(vide)';
    // Ouvert au clic, pas au survol : utilisable sur tablette.
    return (
        <Popover
            opened={opened}
            onChange={(value) => !value && close()}
            position="bottom-end"
            withArrow
            shadow="md"
            width={300}
        >
            <Popover.Target>
                <ActionIcon
                    variant="subtle"
                    color="orange"
                    size="sm"
                    aria-label="Voir la valeur d’origine"
                    onClick={toggle}
                >
                    <IconArrowBackUp size={14} />
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap="xs">
                    <Text size="xs" c="dimmed">
                        Valeur d’origine
                    </Text>
                    <Text
                        size="sm"
                        style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                        }}
                    >
                        {shown}
                    </Text>
                    <Button
                        size="xs"
                        variant="light"
                        color="orange"
                        leftSection={<IconArrowBackUp size={14} />}
                        onClick={() => {
                            close();
                            onRevert();
                        }}
                    >
                        Revenir à cette valeur
                    </Button>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

/**
 * Champ modifié, pas encore enregistré : bordure et fond orange, et un
 * bouton pour voir la valeur d'origine et y revenir.
 */
const changed = (isChanged: boolean, revert?: Revert) =>
    isChanged
        ? {
              'data-changed': true,
              styles: {
                  input: {
                      borderColor: 'var(--mantine-color-orange-6)',
                      backgroundColor: 'var(--mantine-color-orange-light)',
                  },
              },
              ...(revert && {
                  rightSection: <RevertButton {...revert} />,
                  rightSectionPointerEvents: 'all' as const,
              }),
          }
        : {};

/** Libellé d'une valeur parmi des options (statut, format…). */
const labelOf = (options: { value: string; label: string }[], value: string) =>
    options.find((option) => option.value === value)?.label ?? value;

// Valeur du statut « inconnu » (Select n'accepte pas de valeur vide).
const UNKNOWN = 'unknown';
const DEFAULT_MODE = 'default';
const STATUS_OPTIONS = [
    { value: 'ongoing', label: 'En cours de parution' },
    { value: 'completed', label: 'Terminée' },
    { value: UNKNOWN, label: 'Inconnu' },
];

/** Une seule fiche par site : les nouvelles remplacent les anciennes. */
const mergeSources = (links: SourceLink[], added: SourceLink[]) => [
    ...links.filter((link) => !added.some((a) => a.site === link.site)),
    ...added,
];

const sourcesKey = (links: SourceLink[]) =>
    links
        .map((link) => `${link.site}:${link.id}`)
        .sort()
        .join(' ');

const KIND_OPTIONS = VOLUME_KINDS.map((kind) => ({
    value: kind,
    label: VOLUME_KIND_LABELS[kind],
}));

const SERIES_TEXT_FIELDS: { field: SeriesField; label: string }[] = [
    { field: 'Writer', label: 'Scénario' },
    { field: 'Penciller', label: 'Dessin' },
    { field: 'Publisher', label: 'Éditeur' },
];

/**
 * Édition du ComicInfo d'un ensemble de tomes (dossier de brouillons ou
 * série publiée), puis rangement des fichiers à leur emplacement.
 */
export const MetadataEditor = ({
    libraryId,
    kind,
    volumes,
    mode,
    onChanged,
    status: seriesStatus,
    readingMode: seriesMode,
    classification,
    cover,
    autoFill = false,
    next,
}: {
    libraryId: number;
    kind: 'manga' | 'comics';
    volumes: EditorVolume[];
    /** Brouillons : « Publier » ; série publiée : « Renommer les fichiers ». */
    mode: 'drafts' | 'series';
    /** Après un enregistrement ou un rangement (recharger les données). */
    onChanged: (moved?: { from: string; to: string }[]) => void;
    /**
     * Statut de la série (publiée, ou future série d'un dossier de
     * brouillons), enregistré avec le reste par `save`.
     */
    status?: {
        value: SeriesStatus | null;
        save: (status: SeriesStatus | null) => Promise<unknown>;
    };
    /** Série publiée : mode de lecture (null : celui de la bibliothèque). */
    readingMode?: {
        value: ReadingMode | null;
        defaultMode: ReadingMode;
        save: (mode: ReadingMode | null) => Promise<unknown>;
    };
    /**
     * Format (obligatoire) et âge de la série, réglés dans Bento (null : pas
     * encore choisis ; l'âge est alors celui des fichiers).
     */
    classification?: {
        formatId: number | null;
        age: number | null;
        /** Fiches en ligne choisies (Manga-news, Wikipédia). */
        sources?: SourceLink[];
        save: (changes: ClassificationChanges) => Promise<unknown>;
    };
    /** Couverture de la série, et son choix. */
    cover?: { src?: string; disabled?: boolean; onEdit: () => void };
    /**
     * Ouvrir « Remplir », recherche lancée (série à classer) ; avec des
     * fiches déjà choisies, elles sont relues et comparées.
     */
    autoFill?: boolean;
    /** Série suivante à traiter (« Séries à classer »). */
    next?: { name: string; go: () => void };
}) => {
    // Contenu des données reçues : le parent peut recréer la liste à chaque
    // rendu, seule une vraie nouveauté (enregistrement) doit tout reprendre.
    const dataKey = JSON.stringify(
        volumes.map((v) => [v.path, v.comicInfo, v.error ?? null]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const readable = useMemo(() => volumes.filter((v) => !v.error), [dataKey]);
    const paths = readable.map((v) => v.path);
    const [edits, setEdits] = useState<Edits>(() => initialEdits(readable));
    // Modifications d'avant le choix d'une série existante (pour l'annuler),
    // et les réglages de Bento d'alors (format, âge, statut, mode).
    const beforeJoin = useRef<Edits>(undefined);
    const settingsBeforeJoin = useRef<{
        format: string | null;
        age: string;
        status: string;
        mode: string;
    }>(undefined);
    const [pickerKey, setPickerKey] = useState(0);
    // Après une fiche en ligne, compléter numéros, titres et années des tomes.
    const [alsoFileNames, setAlsoFileNames] = useState(true);
    // Fiches trouvées, en cours de comparaison.
    const [comparing, setComparing] = useState<FoundSeries[]>();
    const [refreshing, setRefreshing] = useState(false);
    // Statut de la série (publiée) : « unknown » pour « inconnu ».
    const savedStatus = seriesStatus?.value ?? UNKNOWN;
    const [status, setStatus] = useState<string>(savedStatus);
    useEffect(() => setStatus(savedStatus), [savedStatus]);
    const statusChanged = !!seriesStatus && status !== savedStatus;
    // Mode de lecture de la série : « default » pour celui de la bibliothèque.
    const savedMode = seriesMode?.value ?? DEFAULT_MODE;
    const [modeValue, setModeValue] = useState<string>(savedMode);
    useEffect(() => setModeValue(savedMode), [savedMode]);
    const modeChanged = !!seriesMode && modeValue !== savedMode;
    // Format : son id, null tant qu'il n'est pas choisi (obligatoire).
    const savedFormat =
        classification?.formatId == null
            ? null
            : String(classification.formatId);
    const [formatValue, setFormatValue] = useState<string | null>(savedFormat);
    useEffect(() => setFormatValue(savedFormat), [savedFormat]);
    const formatChanged = !!classification && formatValue !== savedFormat;
    const formatMissing = !!classification && !formatValue;
    // Âge choisi dans Bento : « unknown » pour celui des fichiers.
    const savedAge =
        classification?.age == null ? UNKNOWN : String(classification.age);
    const [ageValue, setAgeValue] = useState<string>(savedAge);
    useEffect(() => setAgeValue(savedAge), [savedAge]);
    const ageChanged = !!classification && ageValue !== savedAge;
    // Fiches en ligne choisies pour la série.
    const savedSources = useMemo(
        () => classification?.sources ?? [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sourcesKey(classification?.sources ?? [])],
    );
    const [sourcesValue, setSourcesValue] = useState(savedSources);
    useEffect(() => setSourcesValue(savedSources), [savedSources]);
    const sourcesChanged =
        !!classification &&
        sourcesKey(sourcesValue) !== sourcesKey(savedSources);
    // Réglages de la série modifiés (enregistrés avec les tomes).
    const settingsChanged =
        statusChanged ||
        modeChanged ||
        formatChanged ||
        ageChanged ||
        sourcesChanged;
    const genres = useQuery(fetchGenres, []);
    const catalog = genres.data ?? [];
    const formats = useQuery(fetchFormats, []);
    const formatOptions = (formats.data ?? []).map((f) => ({
        value: String(f.id),
        label: f.name,
    }));
    const ageSteps = useAgeSteps();
    // Site préféré pour chaque champ (réglages), pour la comparaison.
    const settings = useQuery(fetchSettings, []);
    const priority =
        settings.data?.settings.sourcePriority ?? DEFAULT_SOURCE_PRIORITY;
    // Sites désactivés (réglages) : ni cherchés, ni relus.
    const disabledSources = settings.data?.settings.disabledSources ?? [];
    // Noms déjà connus : suggestions de Scénario, Dessin, Éditeur.
    const credits = useQuery(() => fetchCredits(libraryId), [libraryId]);
    const creditNames = (field: SeriesField) => {
        const known = credits.data;
        if (!known) return [];
        return field === 'Publisher'
            ? known.publishers
            : [...new Set([...known.writers, ...known.pencillers])];
    };
    // Les noms des fiches en ligne reprennent l'écriture de ceux-ci.
    const knownNames = useMemo(
        () => ({
            people: creditNames('Writer'),
            publishers: creditNames('Publisher'),
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [credits.data],
    );
    // Action en cours : roue de chargement sur son seul bouton.
    const [busy, setBusy] = useState<'save' | 'publish'>();
    const [report, setReport] = useState<Report>();
    // Série à classer : recherche lancée, ou ses fiches relues.
    const [finderOpened, finder] = useDisclosure(
        autoFill && savedSources.length === 0,
    );
    const [compressionOpened, compression] = useDisclosure(false);
    // Tome ouvert en aperçu de lecture.
    const [preview, setPreview] = useState<EditorVolume>();
    // Mode essayé dans l'aperçu : celui choisi, même pas encore enregistré.
    const previewMode: ReadingMode =
        modeValue !== DEFAULT_MODE
            ? (modeValue as ReadingMode)
            : (seriesMode?.defaultMode ??
              (kind === 'manga' ? 'ltr-manga' : 'ltr'));
    const canPreview = (volume?: EditorVolume) =>
        !!volume && !volume.error && !!volume.pageCount;
    const firstPreviewable = volumes.find(canPreview);
    const modeOptions = [
        {
            value: DEFAULT_MODE,
            label: `Par défaut : ${readingModeLabel(seriesMode?.defaultMode ?? previewMode)}`,
        },
        ...READING_MODES,
    ];

    // Nouvelles données (après enregistrement) : repartir de celles-ci. Le
    // choix d'une série existante est alors acquis : plus rien à annuler.
    useEffect(() => {
        setEdits(initialEdits(readable));
        beforeJoin.current = undefined;
    }, [readable]);
    const original = useMemo(() => initialEdits(readable), [readable]);
    const seriesChanged = (field: SeriesField) =>
        isSeriesFieldChanged(original, edits, paths, field);
    const volumeChanged = (path: string, field: keyof ComicInfo) =>
        isFieldChanged(original, edits, path, field);
    /** Champ de série : orange s'il a changé, avec sa valeur d'origine. */
    const seriesField = (
        field: SeriesField,
        shown?: (value: string) => string,
    ) => {
        const value = String(seriesValue(original, paths, field) ?? '');
        return changed(seriesChanged(field), {
            original: shown ? shown(value) : value,
            onRevert: () =>
                setEdits((current) =>
                    revertSeriesField(current, original, paths, field),
                ),
        });
    };
    /** Champ d'un tome : orange s'il a changé, avec sa valeur d'origine. */
    const volumeField = (path: string, field: keyof ComicInfo) =>
        changed(volumeChanged(path, field), {
            original: String(original[path]?.[field] ?? ''),
            onRevert: () =>
                setEdits((current) =>
                    setVolumeField(
                        current,
                        path,
                        field,
                        original[path]?.[field],
                    ),
                ),
        });

    const changes = readable
        .map((v) => ({
            path: v.path,
            changes: changesOf(v.comicInfo, edits[v.path] ?? {}),
        }))
        .filter((c) => Object.keys(c.changes).length > 0);
    // Emplacement de chaque tome d'après ce qui est saisi.
    const destinations = readable.map((v) => ({
        volume: v,
        target: publicationPathOf(edits[v.path] ?? {}) ?? null,
    }));
    const toMove = destinations.filter(
        (d) => d.target && d.target !== d.volume.path,
    );
    const incomplete = destinations.filter((d) => !d.target).length;

    const series = (field: SeriesField) =>
        seriesValue(edits, paths, field) ?? '';
    const setSeries = (
        field: SeriesField,
        value: string | number | undefined,
    ) => setEdits((current) => setSeriesField(current, field, value as never));
    const first = paths[0];
    // Âge des fichiers (classification ComicInfo), sans âge choisi.
    const fileAge = ageOfRating(
        String(seriesValue(original, paths, 'AgeRating') ?? ''),
    );
    const ageChoices = [
        ...ageOptions(
            ageSteps,
            ageValue === UNKNOWN ? undefined : Number(ageValue),
        ),
        {
            value: UNKNOWN,
            label:
                fileAge === null
                    ? 'Non classée'
                    : `D’après les fichiers : ${ageLabel(fileAge)}`,
        },
    ];
    /** Âge choisi, et la classification ComicInfo la plus proche. */
    const chooseAge = (value: string) => {
        setAgeValue(value);
        setEdits((current) =>
            value === UNKNOWN
                ? revertSeriesField(current, original, paths, 'AgeRating')
                : setSeriesField(
                      current,
                      'AgeRating',
                      ratingForAge(Number(value)),
                  ),
        );
    };

    /** Valeurs actuelles, comparées aux fiches en ligne. */
    const currentSheet: SheetValues = {
        ...editedValues(edits, paths, catalog),
        ...(classification && formatValue && { Format: formatValue }),
        ...(classification && ageValue !== UNKNOWN && { Age: ageValue }),
        ...(seriesStatus && status !== UNKNOWN && { Status: status }),
    };
    const display = (field: SheetField, value: string) =>
        field === 'Format'
            ? labelOf(formatOptions, value)
            : field === 'Age'
              ? ageLabel(Number(value))
              : field === 'Status'
                ? labelOf(STATUS_OPTIONS, value)
                : value;

    /** Valeurs choisies dans la comparaison, et les fiches gardées. */
    const applyComparison = (values: SheetValues, found: FoundSeries[]) => {
        setEdits((current) => {
            const filled = applySheetValues(current, paths, values, catalog);
            return alsoFileNames
                ? fillFromFileNames(filled, readable, false)
                : filled;
        });
        if (seriesStatus && values.Status) setStatus(values.Status);
        if (!classification) return;
        if (values.Format) setFormatValue(values.Format);
        if (values.Age) chooseAge(values.Age);
        setSourcesValue((current) =>
            mergeSources(
                current,
                found.map((f) => ({ site: f.source, id: f.id })),
            ),
        );
    };

    /** Fiches déjà choisies, relues sur leur site puis comparées. */
    const refresh = async () => {
        setRefreshing(true);
        setReport(undefined);
        const results = await Promise.allSettled(
            sourcesValue
                .filter((link) => !disabledSources.includes(link.site))
                .map(loadFound),
        );
        setRefreshing(false);
        const loaded = results.flatMap((r) =>
            r.status === 'fulfilled' ? [r.value] : [],
        );
        const errors = results.flatMap((r) =>
            r.status === 'rejected' ? [(r.reason as Error).message] : [],
        );
        if (errors.length) {
            setReport({
                color: loaded.length ? 'orange' : 'red',
                lines: errors,
            });
        }
        if (loaded.length) setComparing(loaded);
    };
    // Série à classer avec des fiches : relues dès l'ouverture.
    useEffect(() => {
        if (autoFill && savedSources.length > 0) void refresh();
        // Une seule fois, à l'ouverture.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Complétude de la fiche, avec ce qui est saisi (pas encore enregistré).
    const completeness = completenessOf({
        // Lus dans les tomes (première valeur remplie), comme la fiche
        // série : même pourcentage.
        ...fieldsFromVolumes(readable.map((v) => edits[v.path] ?? {})),
        hasFormat: !classification || !!formatValue,
        hasAge:
            ageValue !== UNKNOWN ||
            ageOfRating(String(series('AgeRating') ?? '')) !== null,
        hasStatus: !seriesStatus || status !== UNKNOWN,
        // Sans `String(undefined)` : « undefined » serait un genre rempli.
        genreCount: classify(
            String(series('Genre') ?? ''),
            String(series('Tags') ?? ''),
            catalog,
        ).genres.length,
    });
    const totalSize = volumes.reduce((sum, v) => sum + (v.size ?? 0), 0);

    /** Enregistre tout ; vrai si tout s'est bien passé. */
    const save = async () => {
        setBusy('save');
        setReport(undefined);
        try {
            const lines: string[] = [];
            let color = 'green';
            if (changes.length) {
                const result = await saveComicInfo(libraryId, changes);
                lines.push(
                    `${result.updated.length} tome(s) enregistré(s)` +
                        (result.failures.length
                            ? `, ${result.failures.length} en échec :`
                            : '.'),
                    ...result.failures.map((f) => `${f.path} : ${f.reason}`),
                );
                if (result.failures.length) color = 'orange';
            }
            if (seriesStatus && statusChanged) {
                await seriesStatus.save(
                    status === UNKNOWN ? null : (status as SeriesStatus),
                );
                lines.push('Statut de la série enregistré.');
            }
            if (
                classification &&
                (formatChanged || ageChanged || sourcesChanged)
            ) {
                await classification.save({
                    ...(formatChanged && {
                        formatId: formatValue ? Number(formatValue) : null,
                    }),
                    ...(ageChanged && {
                        age: ageValue === UNKNOWN ? null : Number(ageValue),
                    }),
                    ...(sourcesChanged && { sources: sourcesValue }),
                });
                if (formatChanged || ageChanged) {
                    lines.push(
                        formatChanged && ageChanged
                            ? 'Format et âge enregistrés.'
                            : formatChanged
                              ? 'Format enregistré.'
                              : 'Âge enregistré.',
                    );
                }
                if (sourcesChanged) lines.push('Fiches en ligne enregistrées.');
            }
            if (seriesMode && modeChanged) {
                await seriesMode.save(
                    modeValue === DEFAULT_MODE
                        ? null
                        : (modeValue as ReadingMode),
                );
                lines.push('Mode de lecture enregistré.');
            }
            setReport({ color, lines });
            onChanged();
            return color === 'green';
        } catch (e) {
            setReport({ color: 'red', lines: [(e as Error).message] });
            return false;
        } finally {
            setBusy(undefined);
        }
    };

    const dirty = changes.length > 0 || settingsChanged;
    /** Enregistre (s'il y a lieu), puis passe à la série suivante. */
    const saveAndNext = async () => {
        if (!next) return;
        if (dirty && !(await save())) return;
        next.go();
    };

    const publish = async () => {
        setBusy('publish');
        setReport(undefined);
        try {
            const result = await publishFiles(
                libraryId,
                toMove.map((d) => d.volume.path),
            );
            setReport({
                color: result.failures.length ? 'orange' : 'green',
                lines: [
                    `${result.published.length} tome(s) ${mode === 'drafts' ? 'publié(s)' : 'renommé(s)'}.`,
                    ...result.failures.map((f) => `${f.path} : ${f.reason}`),
                ],
            });
            onChanged(result.published);
        } catch (e) {
            setReport({ color: 'red', lines: [(e as Error).message] });
        } finally {
            setBusy(undefined);
        }
    };

    const publishReason = formatMissing
        ? 'Choisis d’abord le format de la série'
        : changes.length > 0
          ? 'Enregistre d’abord les modifications'
          : toMove.length === 0
            ? incomplete > 0
                ? `Série et numéro requis (${incomplete} tome(s) incomplet(s))`
                : 'Tous les tomes sont déjà à leur place'
            : undefined;

    return (
        <Stack>
            <Group justify="space-between">
                <Group gap="xs">
                    <Button
                        variant="default"
                        leftSection={<IconWand size={16} />}
                        onClick={finder.open}
                    >
                        Remplir
                    </Button>
                    {sourcesValue.length > 0 && (
                        <Button
                            variant="default"
                            leftSection={<IconRefresh size={16} />}
                            loading={refreshing}
                            onClick={() => void refresh()}
                            title="Relire les fiches en ligne de la série et comparer"
                        >
                            Mettre à jour
                        </Button>
                    )}
                    <Button
                        variant="default"
                        leftSection={<IconFileZip size={16} />}
                        disabled={readable.length === 0}
                        onClick={compression.open}
                    >
                        Compresser…
                    </Button>
                </Group>
                <Group gap="xs">
                    <Button
                        variant="default"
                        disabled={changes.length === 0 && !settingsChanged}
                        onClick={() => {
                            setEdits(initialEdits(readable));
                            beforeJoin.current = undefined;
                            // Le choix d'une série existante est effacé.
                            setPickerKey((key) => key + 1);
                            setStatus(savedStatus);
                            setModeValue(savedMode);
                            setFormatValue(savedFormat);
                            setAgeValue(savedAge);
                            setSourcesValue(savedSources);
                        }}
                    >
                        Annuler
                    </Button>
                    <Button
                        disabled={
                            (changes.length === 0 && !settingsChanged) ||
                            formatMissing ||
                            busy === 'publish'
                        }
                        title={
                            formatMissing
                                ? 'Choisis d’abord le format de la série'
                                : undefined
                        }
                        loading={busy === 'save'}
                        onClick={() => void save()}
                    >
                        Enregistrer
                        {changes.length ? ` (${changes.length})` : ''}
                    </Button>
                    <Button
                        leftSection={<IconUpload size={16} />}
                        disabled={!!publishReason || busy === 'save'}
                        title={publishReason}
                        loading={busy === 'publish'}
                        onClick={() => void publish()}
                    >
                        {mode === 'drafts'
                            ? 'Publier'
                            : 'Renommer les fichiers'}
                        {toMove.length && !publishReason
                            ? ` (${toMove.length})`
                            : ''}
                    </Button>
                    {next && (
                        <Button
                            variant="light"
                            rightSection={<IconArrowRight size={16} />}
                            disabled={(dirty && formatMissing) || !!busy}
                            title={`Série suivante : ${next.name}`}
                            onClick={() => void saveAndNext()}
                        >
                            {dirty ? 'Enregistrer et suivante' : 'Suivante'}
                        </Button>
                    )}
                </Group>
            </Group>
            {publishReason &&
                changes.length === 0 &&
                toMove.length === 0 &&
                incomplete > 0 && (
                    <Text size="xs" c="dimmed">
                        {publishReason}
                    </Text>
                )}
            {report && (
                <Alert
                    color={report.color}
                    withCloseButton
                    onClose={() => setReport(undefined)}
                >
                    {report.lines.map((line) => (
                        <Text key={line} size="sm">
                            {line}
                        </Text>
                    ))}
                </Alert>
            )}

            <Paper withBorder p="md" radius="md">
                <Stack gap="md">
                    <Group gap="sm">
                        <CompletenessBadge completeness={completeness} />
                        <Text size="xs" c="dimmed">
                            {volumeCountLabel(
                                volumes.map((v) => ({
                                    kind: volumeKindOf(
                                        edits[v.path] ?? v.comicInfo,
                                    ),
                                })),
                            )}
                            {totalSize > 0 && ` · ${formatSize(totalSize)}`}
                        </Text>
                        {sourcesValue.length > 0 && (
                            <Group gap={6}>
                                <Text size="xs" c="dimmed">
                                    Fiches :
                                </Text>
                                {sourcesValue.map((link) => (
                                    <Group key={link.site} gap={0}>
                                        <Anchor
                                            href={sourceUrl(link)}
                                            target="_blank"
                                            size="xs"
                                        >
                                            {SOURCE_LABELS[link.site]}
                                        </Anchor>
                                        <CloseButton
                                            size="xs"
                                            aria-label={`Oublier la fiche ${SOURCE_LABELS[link.site]}`}
                                            onClick={() =>
                                                setSourcesValue((current) =>
                                                    current.filter(
                                                        (l) =>
                                                            l.site !==
                                                            link.site,
                                                    ),
                                                )
                                            }
                                        />
                                    </Group>
                                ))}
                            </Group>
                        )}
                    </Group>
                    {mode === 'drafts' && (
                        <ExistingSeriesPicker
                            key={pickerKey}
                            libraryId={libraryId}
                            onJoin={(name, source, joined) => {
                                // Toujours depuis l'état d'avant le premier
                                // choix : une autre série ne garde rien de la
                                // précédente.
                                setEdits((current) => {
                                    beforeJoin.current ??= current;
                                    return joinSeries(
                                        beforeJoin.current,
                                        name,
                                        source,
                                    );
                                });
                                // Format, âge, statut et mode de la série :
                                // repris (le format est obligatoire).
                                settingsBeforeJoin.current ??= {
                                    format: formatValue,
                                    age: ageValue,
                                    status,
                                    mode: modeValue,
                                };
                                const before = settingsBeforeJoin.current;
                                if (classification) {
                                    setFormatValue(
                                        joined.formatId == null
                                            ? before.format
                                            : String(joined.formatId),
                                    );
                                    setAgeValue(
                                        joined.age == null
                                            ? before.age
                                            : String(joined.age),
                                    );
                                }
                                if (seriesStatus) {
                                    setStatus(joined.status ?? before.status);
                                }
                                if (seriesMode) {
                                    setModeValue(
                                        joined.readingMode ?? before.mode,
                                    );
                                }
                            }}
                            onLeave={() => {
                                if (beforeJoin.current) {
                                    setEdits(beforeJoin.current);
                                }
                                beforeJoin.current = undefined;
                                const before = settingsBeforeJoin.current;
                                if (before) {
                                    setFormatValue(before.format);
                                    setAgeValue(before.age);
                                    setStatus(before.status);
                                    setModeValue(before.mode);
                                }
                                settingsBeforeJoin.current = undefined;
                            }}
                        />
                    )}
                    {/* Téléphone : couverture réduite, au-dessus des champs. */}
                    {cover && (
                        <Group gap="sm" hiddenFrom="sm">
                            <Image
                                src={cover.src}
                                w={60}
                                h={90}
                                fit="cover"
                                radius="sm"
                                alt=""
                                fallbackSrc="data:image/gif;base64,R0lGODlhAQABAAAAACw="
                                bg="var(--mantine-color-default-hover)"
                            />
                            <Button
                                size="xs"
                                variant="default"
                                leftSection={<IconPhoto size={14} />}
                                disabled={cover.disabled}
                                onClick={cover.onEdit}
                            >
                                Couverture…
                            </Button>
                        </Group>
                    )}
                    <Group align="flex-start" wrap="nowrap" gap="lg">
                        {cover && (
                            <Stack gap="xs" align="center" visibleFrom="sm">
                                <Image
                                    src={cover.src}
                                    w={120}
                                    h={180}
                                    fit="cover"
                                    radius="sm"
                                    alt=""
                                    fallbackSrc="data:image/gif;base64,R0lGODlhAQABAAAAACw="
                                    bg="var(--mantine-color-default-hover)"
                                />
                                <Button
                                    size="xs"
                                    variant="default"
                                    leftSection={<IconPhoto size={14} />}
                                    disabled={cover.disabled}
                                    onClick={cover.onEdit}
                                >
                                    Couverture…
                                </Button>
                            </Stack>
                        )}
                        <Grid style={{ flex: 1 }} gutter="sm">
                            <Grid.Col span={{ base: 12, sm: 8 }}>
                                <TextInput
                                    label="Nom"
                                    {...seriesField('Series')}
                                    value={String(series('Series'))}
                                    description={
                                        isMixed(edits, paths, 'Series')
                                            ? 'Différent selon les tomes'
                                            : undefined
                                    }
                                    onChange={(e) =>
                                        setSeries(
                                            'Series',
                                            e.currentTarget.value,
                                        )
                                    }
                                />
                            </Grid.Col>
                            {classification && (
                                <Grid.Col span={{ base: 12, sm: 4 }}>
                                    <Select
                                        label="Format"
                                        withAsterisk
                                        placeholder="À choisir"
                                        allowDeselect={false}
                                        value={formatValue}
                                        onChange={setFormatValue}
                                        data={formatOptions}
                                        error={
                                            formatMissing
                                                ? 'Format à choisir'
                                                : undefined
                                        }
                                        {...changed(formatChanged, {
                                            original: savedFormat
                                                ? labelOf(
                                                      formatOptions,
                                                      savedFormat,
                                                  )
                                                : '',
                                            onRevert: () =>
                                                setFormatValue(savedFormat),
                                        })}
                                    />
                                </Grid.Col>
                            )}
                            {SERIES_TEXT_FIELDS.map(({ field, label }) => (
                                <Grid.Col
                                    key={field}
                                    span={{ base: 12, xs: 6, sm: 4 }}
                                >
                                    <CreditInput
                                        {...seriesField(field)}
                                        label={label}
                                        names={creditNames(field)}
                                        value={String(series(field))}
                                        onChange={(value) =>
                                            setSeries(field, value)
                                        }
                                    />
                                </Grid.Col>
                            ))}
                            {seriesStatus && (
                                <Grid.Col span={{ base: 12, xs: 6, sm: 4 }}>
                                    <Select
                                        label="Statut"
                                        allowDeselect={false}
                                        value={status}
                                        onChange={(value) =>
                                            value && setStatus(value)
                                        }
                                        data={STATUS_OPTIONS}
                                        {...changed(statusChanged, {
                                            original: labelOf(
                                                STATUS_OPTIONS,
                                                savedStatus,
                                            ),
                                            onRevert: () =>
                                                setStatus(savedStatus),
                                        })}
                                    />
                                </Grid.Col>
                            )}
                            {classification && (
                                <Grid.Col span={{ base: 12, xs: 6, sm: 4 }}>
                                    <Select
                                        label="Âge"
                                        allowDeselect={false}
                                        value={ageValue}
                                        onChange={(value) =>
                                            value && chooseAge(value)
                                        }
                                        data={ageChoices}
                                        {...changed(ageChanged, {
                                            original: labelOf(
                                                ageChoices,
                                                savedAge,
                                            ),
                                            onRevert: () => {
                                                setAgeValue(savedAge);
                                                setEdits((current) =>
                                                    revertSeriesField(
                                                        current,
                                                        original,
                                                        paths,
                                                        'AgeRating',
                                                    ),
                                                );
                                            },
                                        })}
                                    />
                                </Grid.Col>
                            )}
                            {seriesMode && (
                                <Grid.Col span={{ base: 12, xs: 6, sm: 4 }}>
                                    <Select
                                        label="Mode de lecture"
                                        allowDeselect={false}
                                        value={modeValue}
                                        onChange={(value) =>
                                            value && setModeValue(value)
                                        }
                                        data={modeOptions}
                                        {...changed(modeChanged, {
                                            original: labelOf(
                                                modeOptions,
                                                savedMode,
                                            ),
                                            onRevert: () =>
                                                setModeValue(savedMode),
                                        })}
                                        inputContainer={(children) => (
                                            <Group gap={4} wrap="nowrap">
                                                <div style={{ flex: 1 }}>
                                                    {children}
                                                </div>
                                                <Tooltip label="Aperçu de lecture">
                                                    <ActionIcon
                                                        variant="default"
                                                        size="lg"
                                                        aria-label="Aperçu de lecture de la série"
                                                        disabled={
                                                            !firstPreviewable
                                                        }
                                                        onClick={() =>
                                                            setPreview(
                                                                firstPreviewable,
                                                            )
                                                        }
                                                    >
                                                        <IconEye size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        )}
                                    />
                                </Grid.Col>
                            )}
                            <GenreFields
                                genre={String(series('Genre'))}
                                tags={String(series('Tags'))}
                                catalog={catalog}
                                wrap={(field) => (
                                    <Grid.Col span={{ base: 12, sm: 6 }}>
                                        {field}
                                    </Grid.Col>
                                )}
                                genreProps={seriesField('Genre', (value) =>
                                    classify(value, null, catalog).genres.join(
                                        ', ',
                                    ),
                                )}
                                tagsProps={seriesField('Tags')}
                                onChange={(genre, tags) => {
                                    setEdits((current) =>
                                        setSeriesField(
                                            setSeriesField(
                                                current,
                                                'Genre',
                                                genre,
                                            ),
                                            'Tags',
                                            tags,
                                        ),
                                    );
                                }}
                            />
                        </Grid>
                    </Group>
                    {first && (
                        <Textarea
                            label="Résumé (enregistré sur le premier tome)"
                            {...volumeField(first, 'Summary')}
                            autosize
                            minRows={3}
                            maxRows={10}
                            value={edits[first]?.Summary ?? ''}
                            onChange={(e) => {
                                const value = e.currentTarget.value;
                                setEdits((current) =>
                                    setVolumeField(
                                        current,
                                        first,
                                        'Summary',
                                        value,
                                    ),
                                );
                            }}
                        />
                    )}
                </Stack>
            </Paper>

            <Table.ScrollContainer minWidth={760}>
                <Table verticalSpacing="xs">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th w={48} />
                            <Table.Th>Fichier</Table.Th>
                            <Table.Th w={130}>Type</Table.Th>
                            <Table.Th w={90}>Numéro</Table.Th>
                            <Table.Th>Titre</Table.Th>
                            <Table.Th w={100}>Année</Table.Th>
                            <Table.Th w={40} />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {volumes.map((volume) => {
                            const info: ComicInfo = edits[volume.path] ?? {};
                            const target = destinations.find(
                                (d) => d.volume.path === volume.path,
                            )?.target;
                            const set = <F extends keyof ComicInfo>(
                                field: F,
                                value: ComicInfo[F] | undefined,
                            ) =>
                                setEdits((current) =>
                                    setVolumeField(
                                        current,
                                        volume.path,
                                        field,
                                        value,
                                    ),
                                );
                            return (
                                <Table.Tr key={volume.path}>
                                    <Table.Td>
                                        {volume.cover && (
                                            <Image
                                                src={volume.cover}
                                                w={40}
                                                h={60}
                                                fit="cover"
                                                radius="xs"
                                                alt=""
                                            />
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                        <Text
                                            size="sm"
                                            lineClamp={1}
                                            title={volume.name}
                                        >
                                            {volume.name}
                                        </Text>
                                        {volume.error ? (
                                            <Text size="xs" c="red">
                                                {volume.error}
                                            </Text>
                                        ) : (
                                            <Text
                                                size="xs"
                                                c={target ? 'dimmed' : 'orange'}
                                                lineClamp={1}
                                            >
                                                {target
                                                    ? target === volume.path
                                                        ? 'À sa place'
                                                        : `→ ${target}`
                                                    : 'Série et numéro requis'}
                                            </Text>
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                        <Select
                                            size="xs"
                                            disabled={!!volume.error}
                                            aria-label={`Type de ${volume.name}`}
                                            allowDeselect={false}
                                            data={KIND_OPTIONS}
                                            value={volumeKindOf(info)}
                                            onChange={(value) =>
                                                value &&
                                                setEdits((current) =>
                                                    setVolumeKind(
                                                        current,
                                                        volume.path,
                                                        value as VolumeKind,
                                                    ),
                                                )
                                            }
                                            {...changed(
                                                volumeKindOf(info) !==
                                                    volumeKindOf(
                                                        original[volume.path] ??
                                                            {},
                                                    ),
                                                {
                                                    original:
                                                        VOLUME_KIND_LABELS[
                                                            volumeKindOf(
                                                                original[
                                                                    volume.path
                                                                ] ?? {},
                                                            )
                                                        ],
                                                    onRevert: () =>
                                                        setEdits((current) =>
                                                            setVolumeKind(
                                                                current,
                                                                volume.path,
                                                                volumeKindOf(
                                                                    original[
                                                                        volume
                                                                            .path
                                                                    ] ?? {},
                                                                ),
                                                            ),
                                                        ),
                                                },
                                            )}
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <TextInput
                                            size="xs"
                                            // One-shot : sans numéro.
                                            disabled={
                                                !!volume.error ||
                                                volumeKindOf(info) ===
                                                    'one-shot'
                                            }
                                            aria-label={`Numéro de ${volume.name}`}
                                            {...volumeField(
                                                volume.path,
                                                'Number',
                                            )}
                                            value={info.Number ?? ''}
                                            onChange={(e) =>
                                                set(
                                                    'Number',
                                                    e.currentTarget.value,
                                                )
                                            }
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <TextInput
                                            size="xs"
                                            disabled={!!volume.error}
                                            aria-label={`Titre de ${volume.name}`}
                                            {...volumeField(
                                                volume.path,
                                                'Title',
                                            )}
                                            value={info.Title ?? ''}
                                            onChange={(e) =>
                                                set(
                                                    'Title',
                                                    e.currentTarget.value,
                                                )
                                            }
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <NumberInput
                                            size="xs"
                                            disabled={!!volume.error}
                                            aria-label={`Année de ${volume.name}`}
                                            {...volumeField(
                                                volume.path,
                                                'Year',
                                            )}
                                            hideControls
                                            value={info.Year ?? ''}
                                            onChange={(value) =>
                                                set(
                                                    'Year',
                                                    value === ''
                                                        ? undefined
                                                        : Number(value),
                                                )
                                            }
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        {canPreview(volume) && (
                                            <Tooltip label="Aperçu de lecture">
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="gray"
                                                    aria-label={`Aperçu de ${volume.name}`}
                                                    onClick={() =>
                                                        setPreview(volume)
                                                    }
                                                >
                                                    <IconEye size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                    </Table.Td>
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>

            {preview && (
                <ReaderPreview
                    title={preview.name}
                    pageCount={preview.pageCount ?? 0}
                    pageSrc={(index) =>
                        filePageUrl(libraryId, preview.path, index)
                    }
                    loadSizes={() =>
                        fetchFilePageSizes(libraryId, preview.path)
                    }
                    sizesKey={preview.path}
                    mode={previewMode}
                    onKeepMode={
                        seriesMode ? (mode) => setModeValue(mode) : undefined
                    }
                    onClose={() => setPreview(undefined)}
                />
            )}

            <CompressionModal
                opened={compressionOpened}
                onClose={compression.close}
                libraryId={libraryId}
                files={readable.map((v) => ({ path: v.path, name: v.name }))}
                onCompressed={() => onChanged()}
            />

            <SeriesSearch
                opened={finderOpened}
                onClose={finder.close}
                kind={kind}
                autoSearch={autoFill}
                initialQuery={searchNameOf(String(series('Series')), readable)}
                onCompare={setComparing}
                footer={
                    <Group justify="flex-end">
                        <Button
                            variant="subtle"
                            leftSection={<IconFileText size={16} />}
                            onClick={() => {
                                setEdits((current) =>
                                    fillFromFileNames(current, readable, false),
                                );
                                finder.close();
                            }}
                        >
                            Sans fiche en ligne : noms de fichiers seulement
                        </Button>
                    </Group>
                }
            />

            <SheetComparison
                found={comparing}
                onClose={() => setComparing(undefined)}
                current={currentSheet}
                catalog={catalog}
                formats={formats.data ?? []}
                known={knownNames}
                order={sitesFor(kind, disabledSources)}
                priority={priority}
                display={display}
                onApply={(values) => applyComparison(values, comparing ?? [])}
                footer={
                    <Checkbox
                        label="Puis compléter depuis les noms de fichiers (numéro, titre, année)"
                        checked={alsoFileNames}
                        onChange={(e) =>
                            setAlsoFileNames(e.currentTarget.checked)
                        }
                    />
                }
            />
        </Stack>
    );
};
