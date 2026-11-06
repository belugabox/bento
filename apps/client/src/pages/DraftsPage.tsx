import {
    Alert,
    Grid,
    Group,
    Loader,
    NavLink,
    Paper,
    Select,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconFile, IconFolder } from '@tabler/icons-react';
import { useState } from 'react';

import { CoverPicker } from '@/components/metadata/CoverPicker';
import { MetadataEditor } from '@/components/metadata/MetadataEditor';
import {
    draftCoverUrl,
    fetchDraftFolder,
    fetchDrafts,
    fetchLibraries,
    fileCoverUrl,
    filePageUrl,
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

const folderLabel = (folder: string) =>
    folder === '_draft'
        ? '(racine de _draft)'
        : folder.replace(/^_draft\//, '');

/** Tomes à préparer (`_draft`) : métadonnées puis publication. */
export const DraftsPage = () => {
    const libraries = useQuery(fetchLibraries, []);
    const [chosenLibrary, setChosenLibrary] = useState<number>();
    const libraryId = chosenLibrary ?? libraries.data?.[0]?.id;
    const library = libraries.data?.find((l) => l.id === libraryId);
    const [selected, setSelected] = useState<string>();
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
    };

    if (libraries.error) {
        return <Alert color="red">{libraries.error.message}</Alert>;
    }

    const loadingFolders = libraries.loading || drafts.loading;
    const draft = drafts.data?.find((f) => f.folder === selected);
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
                <Title order={2}>Brouillons</Title>
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
            {loadingFolders && !drafts.data && <Loader mx="auto" />}
            {!loadingFolders && drafts.data?.length === 0 && (
                <Text c="dimmed" ta="center">
                    Aucun brouillon.
                </Text>
            )}
            {!!drafts.data?.length && (
                <Grid>
                    <Grid.Col span={{ base: 12, md: 3 }}>
                        <Paper withBorder radius="md">
                            {drafts.data.map((f) => (
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
                                />
                            ))}
                        </Paper>
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
                                            cover: file.error
                                                ? null
                                                : fileCoverUrl(
                                                      libraryId,
                                                      file.path,
                                                      String(file.size),
                                                  ),
                                        }))}
                                        onChanged={reload}
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
