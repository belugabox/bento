import {
    ActionIcon,
    Alert,
    Group,
    Loader,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconRefresh, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { CoverCard } from '@/components/CoverCard';
import { fetchLibraries, fetchSeriesList, scanLibrary } from '@/services/api';
import { useCurrentUser } from '@/services/auth';
import { useQuery } from '@/services/useQuery';

/** Grille des séries, avec choix de la bibliothèque et recherche. */
export const LibraryPage = () => {
    // Bibliothèque et recherche dans l'adresse : le retour arrière les garde.
    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState(params.get('q') ?? '');
    const [debouncedSearch] = useDebouncedValue(search, 250);
    const [scanning, setScanning] = useState(false);
    const [scanMessage, setScanMessage] = useState<string>();
    const isAdmin = useCurrentUser().role === 'admin';

    const libraries = useQuery(fetchLibraries, []);
    const libraryId =
        Number(params.get('library')) || libraries.data?.[0]?.id || undefined;

    const series = useQuery(
        () => fetchSeriesList({ libraryId, search: debouncedSearch }),
        [libraryId, debouncedSearch],
    );

    const update = (key: string, value: string) =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                if (value) next.set(key, value);
                else next.delete(key);
                return next;
            },
            { replace: true },
        );

    const scan = async () => {
        if (!libraryId) return;
        setScanning(true);
        setScanMessage(undefined);
        try {
            const result = await scanLibrary(libraryId);
            setScanMessage(
                `${result.added} ajouté(s), ${result.updated} mis à jour, ${result.removed} retiré(s)` +
                    (result.errors.length
                        ? `, ${result.errors.length} illisible(s) : ${result.errors.map((e) => e.file).join(', ')}`
                        : ''),
            );
            series.reload();
        } catch (error) {
            setScanMessage((error as Error).message);
        } finally {
            setScanning(false);
        }
    };

    if (libraries.error) {
        return <Alert color="red">{libraries.error.message}</Alert>;
    }
    if (libraries.data?.length === 0) {
        return (
            <Alert color="yellow" title="Aucune bibliothèque">
                Déclarez vos dossiers dans la variable LIBRARIES du serveur.
            </Alert>
        );
    }

    return (
        <Stack>
            <Group justify="space-between" wrap="nowrap">
                {libraries.data && libraries.data.length > 1 ? (
                    <SegmentedControl
                        value={String(libraryId)}
                        onChange={(value) => update('library', value)}
                        data={libraries.data.map((library) => ({
                            value: String(library.id),
                            label: library.name,
                        }))}
                    />
                ) : (
                    <Text fw={500}>{libraries.data?.[0]?.name}</Text>
                )}
                {isAdmin && (
                    <Tooltip label="Rechercher les nouveaux tomes">
                        <ActionIcon
                            variant="default"
                            size="lg"
                            loading={scanning}
                            onClick={scan}
                            aria-label="Scanner la bibliothèque"
                        >
                            <IconRefresh size={18} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>

            <TextInput
                placeholder="Rechercher une série"
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(event) => {
                    setSearch(event.currentTarget.value);
                    update('q', event.currentTarget.value);
                }}
            />

            {scanMessage && (
                <Alert
                    withCloseButton
                    onClose={() => setScanMessage(undefined)}
                >
                    {scanMessage}
                </Alert>
            )}

            {series.error && <Alert color="red">{series.error.message}</Alert>}
            {series.loading && !series.data && <Loader mx="auto" />}
            {series.data?.length === 0 && (
                <Text c="dimmed" ta="center">
                    {debouncedSearch
                        ? 'Aucune série trouvée'
                        : 'Bibliothèque vide'}
                </Text>
            )}
            <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 5, lg: 6 }}>
                {series.data?.map((item) => (
                    <CoverCard
                        key={item.id}
                        to={`/series/${item.id}`}
                        coverId={item.coverVolumeId}
                        title={item.name}
                        subtitle={`${item.volumeCount} tome${item.volumeCount > 1 ? 's' : ''}`}
                    />
                ))}
            </SimpleGrid>
        </Stack>
    );
};
