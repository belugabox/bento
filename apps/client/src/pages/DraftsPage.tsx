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
import { IconFolder } from '@tabler/icons-react';
import { useState } from 'react';

import { MetadataEditor } from '@/components/metadata/MetadataEditor';
import {
    fetchDraftFolder,
    fetchDrafts,
    fetchLibraries,
    fileCoverUrl,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

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
                                    leftSection={<IconFolder size={16} />}
                                    label={folderLabel(f.folder)}
                                    description={`${f.files.length} tome(s)`}
                                />
                            ))}
                        </Paper>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 9 }}>
                        {!selected ? (
                            <Text c="dimmed">Choisis un dossier.</Text>
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
                                <MetadataEditor
                                    key={selected}
                                    libraryId={libraryId}
                                    kind={library.type}
                                    mode="drafts"
                                    volumes={files.map((file) => ({
                                        path: file.path,
                                        name: file.name,
                                        comicInfo: file.comicInfo,
                                        error: file.error,
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
                            )
                        )}
                    </Grid.Col>
                </Grid>
            )}
        </Stack>
    );
};
