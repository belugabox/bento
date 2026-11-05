import {
    Alert,
    Badge,
    Button,
    Checkbox,
    Group,
    Image,
    Menu,
    NumberInput,
    Paper,
    Select,
    SimpleGrid,
    Stack,
    Table,
    Text,
    TextInput,
    Textarea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconChevronDown,
    IconFileText,
    IconUpload,
    IconWorld,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import { type ComicInfo, publicationPathOf } from '@server/types';

import { AGE_RATING_OPTIONS } from '@/components/ageLimits';
import { publishFiles, saveComicInfo } from '@/services/api';

import { WikipediaSearch } from './WikipediaSearch';
import {
    type EditableVolume,
    type Edits,
    type SeriesField,
    changesOf,
    fillFromFileNames,
    fillFromWikipedia,
    initialEdits,
    isFieldChanged,
    isMixed,
    isSeriesFieldChanged,
    seriesValue,
    setSeriesField,
    setVolumeField,
} from './editing';

export type EditorVolume = EditableVolume & {
    /** Adresse de la couverture du tome. */
    cover: string | null;
    error?: string | null;
};

type Report = { color: string; lines: string[] };

/** Champ modifié, pas encore enregistré : bordure et fond orange. */
const changed = (isChanged: boolean) =>
    isChanged
        ? {
              'data-changed': true,
              styles: {
                  input: {
                      borderColor: 'var(--mantine-color-orange-6)',
                      backgroundColor: 'var(--mantine-color-orange-light)',
                  },
              },
          }
        : {};

const SERIES_TEXT_FIELDS: { field: SeriesField; label: string }[] = [
    { field: 'Genre', label: 'Genre' },
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
}: {
    libraryId: number;
    kind: 'manga' | 'comics';
    volumes: EditorVolume[];
    /** Brouillons : « Publier » ; série publiée : « Renommer les fichiers ». */
    mode: 'drafts' | 'series';
    /** Après un enregistrement ou un rangement (recharger les données). */
    onChanged: (moved?: { from: string; to: string }[]) => void;
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
    const [overwrite, setOverwrite] = useState(false);
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<Report>();
    const [wikiOpened, wiki] = useDisclosure(false);

    // Nouvelles données (après enregistrement) : repartir de celles-ci.
    useEffect(() => setEdits(initialEdits(readable)), [readable]);
    const original = useMemo(() => initialEdits(readable), [readable]);
    const seriesChanged = (field: SeriesField) =>
        isSeriesFieldChanged(original, edits, paths, field);
    const volumeChanged = (path: string, field: keyof ComicInfo) =>
        isFieldChanged(original, edits, path, field);

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

    const save = async () => {
        setBusy(true);
        setReport(undefined);
        try {
            const result = await saveComicInfo(libraryId, changes);
            setReport(
                result.failures.length
                    ? {
                          color: 'orange',
                          lines: [
                              `${result.updated.length} tome(s) enregistré(s), ${result.failures.length} en échec :`,
                              ...result.failures.map(
                                  (f) => `${f.path} : ${f.reason}`,
                              ),
                          ],
                      }
                    : {
                          color: 'green',
                          lines: [
                              `${result.updated.length} tome(s) enregistré(s).`,
                          ],
                      },
            );
            onChanged();
        } catch (e) {
            setReport({ color: 'red', lines: [(e as Error).message] });
        } finally {
            setBusy(false);
        }
    };

    const publish = async () => {
        setBusy(true);
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
            setBusy(false);
        }
    };

    const publishReason =
        changes.length > 0
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
                    <Menu position="bottom-start" closeOnItemClick>
                        <Menu.Target>
                            <Button
                                variant="default"
                                rightSection={<IconChevronDown size={14} />}
                            >
                                Remplir
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<IconWorld size={14} />}
                                onClick={wiki.open}
                            >
                                Depuis Wikipédia…
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<IconFileText size={14} />}
                                onClick={() =>
                                    setEdits((current) =>
                                        fillFromFileNames(
                                            current,
                                            readable,
                                            overwrite,
                                        ),
                                    )
                                }
                            >
                                Depuis les noms de fichiers
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item closeMenuOnClick={false}>
                                <Checkbox
                                    size="xs"
                                    label="Écraser les valeurs existantes"
                                    checked={overwrite}
                                    onChange={(e) =>
                                        setOverwrite(e.currentTarget.checked)
                                    }
                                />
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                    {overwrite && (
                        <Badge color="orange" variant="light">
                            Écrasement activé
                        </Badge>
                    )}
                </Group>
                <Group gap="xs">
                    <Button
                        variant="default"
                        disabled={changes.length === 0}
                        onClick={() => setEdits(initialEdits(readable))}
                    >
                        Annuler
                    </Button>
                    <Button
                        disabled={changes.length === 0}
                        loading={busy}
                        onClick={() => void save()}
                    >
                        Enregistrer
                        {changes.length ? ` (${changes.length})` : ''}
                    </Button>
                    <Button
                        color="teal"
                        leftSection={<IconUpload size={16} />}
                        disabled={!!publishReason}
                        title={publishReason}
                        loading={busy}
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
            {changes.length > 0 && (
                <Text size="xs" c="orange">
                    En orange : modifié, pas encore enregistré.
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
                <Stack gap="sm">
                    <Text fw={600}>Série</Text>
                    <SimpleGrid cols={{ base: 1, sm: 3 }}>
                        <TextInput
                            label="Nom"
                            {...changed(seriesChanged('Series'))}
                            value={String(series('Series'))}
                            description={
                                isMixed(edits, paths, 'Series')
                                    ? 'Différent selon les tomes'
                                    : undefined
                            }
                            onChange={(e) =>
                                setSeries('Series', e.currentTarget.value)
                            }
                        />
                        <NumberInput
                            label="Nombre de tomes parus"
                            {...changed(seriesChanged('Count'))}
                            min={0}
                            value={series('Count')}
                            onChange={(value) =>
                                setSeries(
                                    'Count',
                                    value === '' ? undefined : Number(value),
                                )
                            }
                        />
                        <Select
                            label="Classification"
                            {...changed(seriesChanged('AgeRating'))}
                            clearable
                            placeholder="Aucune"
                            value={String(series('AgeRating')) || null}
                            onChange={(value) =>
                                setSeries('AgeRating', value ?? undefined)
                            }
                            data={AGE_RATING_OPTIONS}
                        />
                        {SERIES_TEXT_FIELDS.map(({ field, label }) => (
                            <TextInput
                                key={field}
                                {...changed(seriesChanged(field))}
                                label={label}
                                value={String(series(field))}
                                onChange={(e) =>
                                    setSeries(field, e.currentTarget.value)
                                }
                            />
                        ))}
                    </SimpleGrid>
                    {first && (
                        <Textarea
                            label="Résumé (enregistré sur le premier tome)"
                            {...changed(volumeChanged(first, 'Summary'))}
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
                                            {...changed(
                                                volumeChanged(
                                                    volume.path,
                                                    'Number',
                                                ),
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
                                            {...changed(
                                                volumeChanged(
                                                    volume.path,
                                                    'Title',
                                                ),
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
                                            {...changed(
                                                volumeChanged(
                                                    volume.path,
                                                    'Year',
                                                ),
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
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>

            <WikipediaSearch
                opened={wikiOpened}
                onClose={wiki.close}
                kind={kind}
                initialQuery={String(series('Series'))}
                onPick={(details) =>
                    setEdits((current) =>
                        fillFromWikipedia(current, paths, details, overwrite),
                    )
                }
            />
        </Stack>
    );
};
