import {
    ActionIcon,
    Alert,
    Button,
    Checkbox,
    Grid,
    Group,
    Image,
    NumberInput,
    Paper,
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
    IconEye,
    IconFileText,
    IconFileZip,
    IconPhoto,
    IconUpload,
    IconWand,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
    type ComicInfo,
    classify,
    genreKey,
    publicationPathOf,
} from '@server/types';

import {
    ageLabel,
    ageOfRating,
    ageOptions,
    ratingForAge,
    useAgeSteps,
} from '@/components/ageLimits';
import { ReaderPreview } from '@/reader/ReaderPreview';
import {
    READING_MODES,
    type ReadingMode,
    readingModeLabel,
} from '@/reader/navigation';
import {
    type ClassificationChanges,
    fetchFilePageSizes,
    fetchFormats,
    fetchGenres,
    filePageUrl,
    publishFiles,
    saveComicInfo,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

import { CompressionModal } from './CompressionModal';
import { ExistingSeriesPicker } from './ExistingSeriesPicker';
import { GenreFields } from './GenreFields';
import { SeriesSearch } from './SeriesSearch';
import {
    type EditableVolume,
    type Edits,
    type SeriesField,
    type SeriesStatus,
    changesOf,
    fillFromFileNames,
    fillFromSheet,
    initialEdits,
    isFieldChanged,
    isMixed,
    isSeriesFieldChanged,
    joinSeries,
    revertSeriesField,
    seriesValue,
    setSeriesField,
    setVolumeField,
} from './editing';

export type EditorVolume = EditableVolume & {
    /** Adresse de la couverture du tome. */
    cover: string | null;
    error?: string | null;
    /** Nombre de pages (aperçu de lecture). */
    pageCount?: number;
};

type Report = { color: string; lines: string[] };

/** Valeur d'origine d'un champ modifié, et comment y revenir. */
type Revert = { original: string; onRevert: () => void };

// Un long résumé n'est montré qu'en partie dans la bulle.
const ORIGINAL_PREVIEW = 300;

/** Bouton dans un champ modifié : montre sa valeur d'origine, et y revient. */
const RevertButton = ({ original, onRevert }: Revert) => {
    const shown =
        original.length > ORIGINAL_PREVIEW
            ? `${original.slice(0, ORIGINAL_PREVIEW)}…`
            : original || '(vide)';
    return (
        <Tooltip
            label={`Valeur d’origine : ${shown}`}
            multiline
            maw={320}
            withinPortal
        >
            <ActionIcon
                variant="subtle"
                color="orange"
                size="sm"
                aria-label={`Revenir à la valeur d’origine : ${shown}`}
                onClick={onRevert}
            >
                <IconArrowBackUp size={14} />
            </ActionIcon>
        </Tooltip>
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
        save: (changes: ClassificationChanges) => Promise<unknown>;
    };
    /** Couverture de la série, et son choix. */
    cover?: { src?: string; disabled?: boolean; onEdit: () => void };
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
    // Modifications d'avant le choix d'une série existante (pour l'annuler).
    const beforeJoin = useRef<Edits>(undefined);
    const [pickerKey, setPickerKey] = useState(0);
    const [overwrite, setOverwrite] = useState(false);
    // Après Wikipédia, compléter numéros, titres et années des tomes.
    const [alsoFileNames, setAlsoFileNames] = useState(true);
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
    // Réglages de la série modifiés (enregistrés avec les tomes).
    const settingsChanged =
        statusChanged || modeChanged || formatChanged || ageChanged;
    const genres = useQuery(fetchGenres, []);
    const catalog = genres.data ?? [];
    const formats = useQuery(fetchFormats, []);
    const formatOptions = (formats.data ?? []).map((f) => ({
        value: String(f.id),
        label: f.name,
    }));
    const ageSteps = useAgeSteps();
    // Action en cours : roue de chargement sur son seul bouton.
    const [busy, setBusy] = useState<'save' | 'publish'>();
    const [report, setReport] = useState<Report>();
    const [finderOpened, finder] = useDisclosure(false);
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
            if (classification && (formatChanged || ageChanged)) {
                await classification.save({
                    ...(formatChanged && {
                        formatId: formatValue ? Number(formatValue) : null,
                    }),
                    ...(ageChanged && {
                        age: ageValue === UNKNOWN ? null : Number(ageValue),
                    }),
                });
                lines.push(
                    formatChanged && ageChanged
                        ? 'Format et âge enregistrés.'
                        : formatChanged
                          ? 'Format enregistré.'
                          : 'Âge enregistré.',
                );
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
        } catch (e) {
            setReport({ color: 'red', lines: [(e as Error).message] });
        } finally {
            setBusy(undefined);
        }
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
                    {mode === 'drafts' && (
                        <ExistingSeriesPicker
                            key={pickerKey}
                            libraryId={libraryId}
                            onJoin={(name, source) =>
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
                                })
                            }
                            onLeave={() => {
                                if (beforeJoin.current) {
                                    setEdits(beforeJoin.current);
                                }
                                beforeJoin.current = undefined;
                            }}
                        />
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
                                    <TextInput
                                        {...seriesField(field)}
                                        label={label}
                                        value={String(series(field))}
                                        onChange={(e) =>
                                            setSeries(
                                                field,
                                                e.currentTarget.value,
                                            )
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

            <Table.ScrollContainer minWidth={640}>
                <Table verticalSpacing="xs">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th w={48} />
                            <Table.Th>Fichier</Table.Th>
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
                                        <TextInput
                                            size="xs"
                                            disabled={!!volume.error}
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
                initialQuery={String(series('Series'))}
                onPick={({ sheet }) => {
                    // Genres et thèmes rangés d'après la liste des genres
                    // (« Suspense » devient « Thriller »).
                    const sorted = classify(sheet.genre, sheet.tags, catalog);
                    const tidy = {
                        ...sheet,
                        genre: sorted.genres.join(', '),
                        tags: sorted.themes.join(', '),
                    };
                    setEdits((current) => {
                        const filled = fillFromSheet(
                            current,
                            paths,
                            tidy,
                            overwrite,
                        );
                        return alsoFileNames
                            ? fillFromFileNames(filled, readable, overwrite)
                            : filled;
                    });
                    if (sheet.status && (overwrite || status === UNKNOWN)) {
                        setStatus(sheet.status);
                    }
                    if (!classification) return;
                    // Format de la fiche, parmi ceux des réglages.
                    const format = formats.data?.find(
                        (f) =>
                            !!sheet.format &&
                            genreKey(f.name) === genreKey(sheet.format),
                    );
                    if (format && (overwrite || !formatValue)) {
                        setFormatValue(String(format.id));
                    }
                    if (
                        sheet.age !== undefined &&
                        (overwrite || ageValue === UNKNOWN)
                    ) {
                        setAgeValue(String(sheet.age));
                    }
                }}
                footer={
                    <Stack gap="xs">
                        <Checkbox
                            label="Puis compléter depuis les noms de fichiers (numéro, titre, année)"
                            checked={alsoFileNames}
                            onChange={(e) =>
                                setAlsoFileNames(e.currentTarget.checked)
                            }
                        />
                        <Checkbox
                            label="Écraser les valeurs existantes"
                            checked={overwrite}
                            onChange={(e) =>
                                setOverwrite(e.currentTarget.checked)
                            }
                        />
                        <Group justify="flex-end">
                            <Button
                                variant="subtle"
                                leftSection={<IconFileText size={16} />}
                                onClick={() => {
                                    setEdits((current) =>
                                        fillFromFileNames(
                                            current,
                                            readable,
                                            overwrite,
                                        ),
                                    );
                                    finder.close();
                                }}
                            >
                                Sans fiche en ligne : noms de fichiers seulement
                            </Button>
                        </Group>
                    </Stack>
                }
            />
        </Stack>
    );
};
