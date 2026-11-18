import {
    Accordion,
    Alert,
    Badge,
    Button,
    Grid,
    Group,
    Loader,
    Menu,
    NavLink,
    Paper,
    Progress,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArchive,
    IconArchiveOff,
    IconArrowMerge,
    IconFile,
    IconFolder,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { DeleteDraftModal } from '@/components/DeleteDraftModal';
import { MergeDraftsModal } from '@/components/MergeDraftsModal';
import { PageHeader } from '@/components/PageHeader';
import { PageLoader } from '@/components/PageLoader';
import { completenessColor } from '@/components/completeness';
import { draftLabel } from '@/components/draftLabel';
import { CoverPicker } from '@/components/metadata/CoverPicker';
import { MetadataEditor } from '@/components/metadata/MetadataEditor';
import {
    type DraftFolder,
    draftCoverUrl,
    fetchDraftFolder,
    fetchDrafts,
    fetchLibraries,
    fileCoverUrl,
    filePageUrl,
    notifyDraftsChanged,
    setDraftArchived,
    setDraftClassification,
    setDraftCover,
    setDraftReadingMode,
    setDraftStatus,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

/**
 * Un groupe de brouillons est un dossier, ou un tome seul déposé à la
 * racine de _draft (chacun forme sa propre série).
 */
const isLoneFile = (folder: string) => /^_draft\/[^/]+\.cb[zr]$/i.test(folder);

const folderLabel = draftLabel;

/**
 * Brouillons en attente qui semblent être une même série (même nom reconnu,
 * reçue un dossier par tome) : à fusionner. Le premier dossier les reçoit
 * (un vrai dossier plutôt qu'un tome seul).
 */
const mergeGroups = (drafts: DraftFolder[]) => {
    const byKey = new Map<string, DraftFolder[]>();
    for (const draft of drafts) {
        if (draft.archivedAt || !draft.mergeKey) continue;
        byKey.set(draft.mergeKey, [
            ...(byKey.get(draft.mergeKey) ?? []),
            draft,
        ]);
    }
    return [...byKey.values()]
        .filter((group) => group.length > 1)
        .map((group) => {
            const into = group.find((d) => !isLoneFile(d.folder)) ?? group[0]!;
            return {
                name: into.seriesName,
                into: into.folder,
                from: group.filter((d) => d !== into).map((d) => d.folder),
            };
        });
};

/** Relecture du dossier pendant la conversion de ses PDF. */
const CONVERSION_POLL_MS = 3000;

/** Tomes à préparer (`_draft`) : métadonnées puis publication. */
export const DraftsPage = () => {
    const libraries = useQuery(fetchLibraries, []);
    // `?library=1&folder=_draft/Gantz` : ce dossier ouvert (série remise
    // en brouillon).
    const [params] = useSearchParams();
    const [chosenLibrary, setChosenLibrary] = useState<number | undefined>(
        () => Number(params.get('library')) || undefined,
    );
    const libraryId = chosenLibrary ?? libraries.data?.[0]?.id;
    const library = libraries.data?.find((l) => l.id === libraryId);
    const [selected, setSelected] = useState<string | undefined>(
        () => params.get('folder') ?? undefined,
    );
    const [deleteOpened, setDeleteOpened] = useState(false);
    // Fusion ouverte : dossier qui reçoit, brouillons cochés.
    const [merge, setMerge] = useState<{ into: string; initial: string[] }>();
    const [coverOpened, cover] = useDisclosure(false);

    // Liste des dossiers : rapide (les archives ne sont pas ouvertes).
    const drafts = useQuery(
        () => (libraryId ? fetchDrafts(libraryId) : Promise.resolve(undefined)),
        [libraryId],
    );
    // Dossier choisi : ses archives sont lues (long la première fois).
    // Les données gardent leur dossier : un rechargement (après
    // enregistrement) laisse l'éditeur affiché, un autre dossier non.
    const folderFiles = useQuery(
        async () =>
            libraryId && selected
                ? {
                      folder: selected,
                      files: await fetchDraftFolder(libraryId, selected),
                  }
                : undefined,
        [libraryId, selected],
    );
    const files =
        folderFiles.data?.folder === selected
            ? folderFiles.data?.files
            : undefined;

    const reload = () => {
        drafts.reload();
        folderFiles.reload();
        notifyDraftsChanged();
    };

    // PDF convertis en arrière-plan par le serveur : le dossier est relu
    // jusqu'à la fin, puis l'éditeur s'ouvre.
    const converting = files?.filter((file) => file.converting).length ?? 0;
    const reloadFolder = folderFiles.reload;
    useEffect(() => {
        if (converting === 0) return;
        const timer = setTimeout(reloadFolder, CONVERSION_POLL_MS);
        return () => clearTimeout(timer);
    }, [converting, files, reloadFolder]);

    if (libraries.error) {
        return <Alert color="red">{libraries.error.message}</Alert>;
    }

    const loadingFolders = libraries.loading || drafts.loading;
    const draft = drafts.data?.find((f) => f.folder === selected);
    // Mis de côté : en bas, sous une liste repliée.
    const waiting = drafts.data?.filter((f) => !f.archivedAt) ?? [];
    const archived = drafts.data?.filter((f) => f.archivedAt) ?? [];

    const groups = mergeGroups(drafts.data ?? []);
    /** « Fusionner avec… » : les brouillons du même nom déjà cochés. */
    const mergeSelected = () => {
        if (!selected) return;
        const group = groups.find(
            (g) => g.into === selected || g.from.includes(selected),
        );
        setMerge({
            into: selected,
            initial: group
                ? [group.into, ...group.from].filter((f) => f !== selected)
                : [],
        });
    };

    const archive = async (value: boolean) => {
        if (!libraryId || !selected) return;
        await setDraftArchived(libraryId, selected, value);
        drafts.reload();
        notifyDraftsChanged();
    };

    const draftLink = (f: DraftFolder) => (
        <NavLink
            key={f.folder}
            active={f.folder === selected}
            onClick={() => setSelected(f.folder)}
            leftSection={
                isLoneFile(f.folder) ? (
                    <IconFile size={16} />
                ) : (
                    <IconFolder size={16} />
                )
            }
            label={folderLabel(f.folder)}
            description={`${f.files.length} tome(s)`}
            // Fiche de la future série, comme dans l'éditeur (enregistrée).
            rightSection={
                f.completeness && (
                    <Badge
                        size="sm"
                        variant="light"
                        color={completenessColor(f.completeness.percent)}
                        aria-label={`Fiche complète à ${f.completeness.percent} %`}
                        title={
                            f.completeness.missing.length
                                ? `À compléter : ${f.completeness.missing.join(', ')}`
                                : undefined
                        }
                    >
                        {f.completeness.percent} %
                    </Badge>
                )
            }
        />
    );
    const readableFiles = files?.filter((file) => !file.error) ?? [];
    // Couverture choisie, sinon celle du premier fichier.
    const currentCover =
        libraryId && selected && draft?.coverUpdatedAt
            ? draftCoverUrl(libraryId, selected, draft.coverUpdatedAt)
            : libraryId && readableFiles[0]
              ? fileCoverUrl(
                    libraryId,
                    readableFiles[0].path,
                    String(readableFiles[0].size),
                )
              : undefined;

    return (
        <Stack>
            <Group justify="space-between">
                <PageHeader back="/me" title="Brouillons" />
                {libraries.data && libraries.data.length > 1 && (
                    <Select
                        allowDeselect={false}
                        value={String(libraryId)}
                        onChange={(value) => {
                            setChosenLibrary(Number(value));
                            setSelected(undefined);
                        }}
                        data={libraries.data.map((l) => ({
                            value: String(l.id),
                            label: l.name,
                        }))}
                    />
                )}
            </Group>
            <Text size="sm" c="dimmed">
                Les tomes déposés dans le dossier _draft de la bibliothèque (par
                la synchro de beluga-box, par exemple). Complète leurs
                métadonnées, puis publie-les : ils sont rangés en « Série/Série
                #NN (Année).cbz » et apparaissent aux lecteurs.
            </Text>
            {drafts.error && <Alert color="red">{drafts.error.message}</Alert>}
            {loadingFolders && !drafts.data && <PageLoader />}
            {!loadingFolders && drafts.data?.length === 0 && (
                <Text c="dimmed" ta="center">
                    Aucun brouillon.
                </Text>
            )}
            {groups.map((group) => (
                <Alert
                    key={group.into}
                    color="blue"
                    icon={<IconArrowMerge size={18} />}
                    title={`${group.from.length + 1} brouillons semblent être « ${group.name} »`}
                >
                    <Group justify="space-between" gap="xs">
                        <Text size="sm">
                            {[group.into, ...group.from]
                                .map(folderLabel)
                                .join(', ')}
                        </Text>
                        <Button
                            size="xs"
                            variant="light"
                            onClick={() =>
                                setMerge({
                                    into: group.into,
                                    initial: group.from,
                                })
                            }
                        >
                            Fusionner
                        </Button>
                    </Group>
                </Alert>
            ))}
            {libraryId && merge && (
                <MergeDraftsModal
                    key={`${merge.into}:${merge.initial.join('|')}`}
                    opened
                    onClose={() => setMerge(undefined)}
                    libraryId={libraryId}
                    into={merge.into}
                    candidates={(drafts.data ?? [])
                        .map((d) => d.folder)
                        .filter((f) => f !== merge.into)}
                    initial={merge.initial}
                    onMerged={(folder) => {
                        setSelected(folder);
                        drafts.reload();
                        folderFiles.reload();
                        notifyDraftsChanged();
                    }}
                />
            )}
            {!!drafts.data?.length && (
                <Grid>
                    <Grid.Col span={{ base: 12, md: 3 }}>
                        <Paper withBorder radius="md">
                            {waiting.map(draftLink)}
                            {waiting.length === 0 && (
                                <Text size="sm" c="dimmed" p="sm">
                                    Aucun brouillon en attente.
                                </Text>
                            )}
                        </Paper>
                        {archived.length > 0 && (
                            <Accordion
                                mt="sm"
                                variant="contained"
                                radius="md"
                                // Ouverte si le dossier choisi y est.
                                defaultValue={
                                    archived.some((f) => f.folder === selected)
                                        ? 'archived'
                                        : null
                                }
                            >
                                <Accordion.Item value="archived">
                                    <Accordion.Control
                                        icon={<IconArchive size={16} />}
                                    >
                                        Archivés ({archived.length})
                                    </Accordion.Control>
                                    <Accordion.Panel
                                        styles={{
                                            content: { padding: 0 },
                                        }}
                                    >
                                        {archived.map(draftLink)}
                                    </Accordion.Panel>
                                </Accordion.Item>
                            </Accordion>
                        )}
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 9 }}>
                        {!selected ? (
                            <Text c="dimmed">
                                Choisis un dossier ou un tome.
                            </Text>
                        ) : folderFiles.error ? (
                            <Alert color="red">
                                {folderFiles.error.message}
                            </Alert>
                        ) : !files ? (
                            <Stack align="center" py="xl">
                                <Loader />
                                <Text size="sm" c="dimmed">
                                    Lecture des archives… La première fois, un
                                    gros dossier peut prendre quelques secondes.
                                </Text>
                            </Stack>
                        ) : files.length === 0 ? (
                            <Text c="dimmed">Ce dossier est vide.</Text>
                        ) : converting > 0 ? (
                            <Stack py="xl" maw={420} mx="auto" w="100%">
                                <Text fw={500}>Conversion des PDF en CBZ…</Text>
                                <Progress
                                    value={
                                        ((files.length - converting) /
                                            files.length) *
                                        100
                                    }
                                    animated
                                />
                                <Text size="sm" c="dimmed">
                                    {files.length - converting} / {files.length}{' '}
                                    fichiers prêts. Les images des pages sont
                                    reprises telles quelles ; l'éditeur s'ouvre
                                    à la fin.
                                </Text>
                            </Stack>
                        ) : (
                            libraryId &&
                            library && (
                                <Stack>
                                    <MetadataEditor
                                        cover={{
                                            src: currentCover,
                                            disabled:
                                                readableFiles.length === 0,
                                            onEdit: cover.open,
                                        }}
                                        key={selected}
                                        libraryId={libraryId}
                                        kind={library.type}
                                        mode="drafts"
                                        // Série publiée du même nom : ses
                                        // informations sont reprises.
                                        existingSeriesId={
                                            draft?.seriesId ?? undefined
                                        }
                                        status={{
                                            value: draft?.status ?? null,
                                            save: (status) =>
                                                setDraftStatus(
                                                    libraryId,
                                                    selected,
                                                    status,
                                                ),
                                        }}
                                        classification={{
                                            formatId: draft?.formatId ?? null,
                                            age: draft?.age ?? null,
                                            startYear: draft?.startYear ?? null,
                                            endYear: draft?.endYear ?? null,
                                            sources: draft?.sources ?? [],
                                            rating: draft?.rating ?? null,
                                            save: (changes) =>
                                                setDraftClassification(
                                                    libraryId,
                                                    selected,
                                                    changes,
                                                ),
                                        }}
                                        readingMode={{
                                            value: draft?.readingMode ?? null,
                                            defaultMode:
                                                library.defaultReadingMode,
                                            save: (mode) =>
                                                setDraftReadingMode(
                                                    libraryId,
                                                    selected,
                                                    mode,
                                                ),
                                        }}
                                        volumes={files.map((file) => ({
                                            path: file.path,
                                            name: file.name,
                                            comicInfo: file.comicInfo,
                                            error: file.error,
                                            pageCount: file.pageCount,
                                            size: file.size,
                                            cover: file.error
                                                ? null
                                                : fileCoverUrl(
                                                      libraryId,
                                                      file.path,
                                                      String(file.size),
                                                  ),
                                        }))}
                                        onChanged={reload}
                                        menu={
                                            <>
                                                <Menu.Item
                                                    leftSection={
                                                        draft?.archivedAt ? (
                                                            <IconArchiveOff
                                                                size={16}
                                                            />
                                                        ) : (
                                                            <IconArchive
                                                                size={16}
                                                            />
                                                        )
                                                    }
                                                    onClick={() =>
                                                        void archive(
                                                            !draft?.archivedAt,
                                                        )
                                                    }
                                                >
                                                    {draft?.archivedAt
                                                        ? 'Remettre en attente'
                                                        : 'Archiver'}
                                                </Menu.Item>
                                                <Menu.Item
                                                    leftSection={
                                                        <IconArrowMerge
                                                            size={16}
                                                        />
                                                    }
                                                    disabled={
                                                        (drafts.data?.length ??
                                                            0) < 2
                                                    }
                                                    onClick={mergeSelected}
                                                >
                                                    Fusionner avec…
                                                </Menu.Item>
                                                <Menu.Item
                                                    color="red"
                                                    leftSection={
                                                        <IconTrash size={16} />
                                                    }
                                                    onClick={() =>
                                                        setDeleteOpened(true)
                                                    }
                                                >
                                                    Supprimer du disque
                                                </Menu.Item>
                                            </>
                                        }
                                    />
                                    <DeleteDraftModal
                                        opened={deleteOpened}
                                        onClose={() => setDeleteOpened(false)}
                                        libraryId={libraryId}
                                        folder={selected}
                                        label={folderLabel(selected)}
                                        volumeCount={files.length}
                                        size={files.reduce(
                                            (sum, f) => sum + f.size,
                                            0,
                                        )}
                                        onDeleted={() => {
                                            setSelected(undefined);
                                            drafts.reload();
                                            notifyDraftsChanged();
                                        }}
                                    />
                                    <CoverPicker
                                        key={`cover:${selected}`}
                                        opened={coverOpened}
                                        onClose={cover.close}
                                        seriesName={
                                            readableFiles[0]?.comicInfo
                                                .Series ||
                                            folderLabel(selected).replace(
                                                /\.cb[zr]$/i,
                                                '',
                                            )
                                        }
                                        kind={library.type}
                                        current={currentCover}
                                        volumes={readableFiles.map((file) => ({
                                            key: file.path,
                                            label: file.name,
                                            pageCount: file.pageCount,
                                            cover: fileCoverUrl(
                                                libraryId,
                                                file.path,
                                                String(file.size),
                                            ),
                                            page: (index) =>
                                                filePageUrl(
                                                    libraryId,
                                                    file.path,
                                                    index,
                                                ),
                                            source: (page) => ({
                                                type: 'file',
                                                path: file.path,
                                                page,
                                            }),
                                        }))}
                                        save={(source) =>
                                            setDraftCover(
                                                libraryId,
                                                selected,
                                                source,
                                            )
                                        }
                                        onChanged={drafts.reload}
                                    />
                                </Stack>
                            )
                        )}
                    </Grid.Col>
                </Grid>
            )}
        </Stack>
    );
};
