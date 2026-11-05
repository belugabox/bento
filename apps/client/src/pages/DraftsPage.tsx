import {
    Alert,
    Badge,
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
import { fetchDrafts, fetchLibraries, fileCoverUrl } from '@/services/api';
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
    const drafts = useQuery(
        () => (libraryId ? fetchDrafts(libraryId) : Promise.resolve([])),
        [libraryId],
    );
    const [selected, setSelected] = useState<string>();
    const folder = drafts.data?.find((f) => f.folder === selected);

    if (libraries.error)
        return <Alert color="red">{libraries.error.message}</Alert>;

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
            {drafts.loading && !drafts.data && <Loader mx="auto" />}
            {drafts.data?.length === 0 && (
                <Text c="dimmed" ta="center">
                    Aucun brouillon.
                </Text>
            )}
            {!!drafts.data?.length && (
                <Grid>
                    <Grid.Col span={{ base: 12, md: 3 }}>
                        <Paper withBorder radius="md">
                            {drafts.data.map((f) => {
                                const errors = f.files.filter(
                                    (file) => file.error,
                                ).length;
                                return (
                                    <NavLink
                                        key={f.folder}
                                        active={f.folder === selected}
                                        onClick={() => setSelected(f.folder)}
                                        leftSection={<IconFolder size={16} />}
                                        label={folderLabel(f.folder)}
                                        description={`${f.files.length} tome(s)`}
                                        rightSection={
                                            errors > 0 && (
                                                <Badge color="red" size="sm">
                                                    {errors}
                                                </Badge>
                                            )
                                        }
                                    />
                                );
                            })}
                        </Paper>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 9 }}>
                        {folder && libraryId && library ? (
                            <MetadataEditor
                                key={folder.folder}
                                libraryId={libraryId}
                                kind={library.type}
                                mode="drafts"
                                volumes={folder.files.map((file) => ({
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
                                onChanged={drafts.reload}
                            />
                        ) : (
                            <Text c="dimmed">Choisis un dossier.</Text>
                        )}
                    </Grid.Col>
                </Grid>
            )}
        </Stack>
    );
};
