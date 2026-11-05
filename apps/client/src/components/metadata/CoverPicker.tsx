import {
    Alert,
    Button,
    Group,
    Image,
    Modal,
    NumberInput,
    Select,
    SimpleGrid,
    Stack,
    Tabs,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState } from 'react';

import {
    type CoverSource,
    coverUrl,
    pageUrl,
    setSeriesCover,
} from '@/services/api';

import { WikipediaSearch } from './WikipediaSearch';

type Volume = { id: number; label: string; pageCount: number };

/** Choix de la couverture d'une série : tome, page, Wikipédia ou défaut. */
export const CoverPicker = ({
    opened,
    onClose,
    seriesId,
    seriesName,
    kind,
    volumes,
    onChanged,
}: {
    opened: boolean;
    onClose: () => void;
    seriesId: number;
    seriesName: string;
    kind: 'manga' | 'comics';
    volumes: Volume[];
    onChanged: () => void;
}) => {
    const [volumeId, setVolumeId] = useState<number | undefined>(
        volumes[0]?.id,
    );
    const [page, setPage] = useState(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [wikiOpened, wiki] = useDisclosure(false);
    const volume = volumes.find((v) => v.id === volumeId);

    const apply = async (source: CoverSource) => {
        setBusy(true);
        setError(undefined);
        try {
            await setSeriesCover(seriesId, source);
            onChanged();
            onClose();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Modal
                opened={opened && !wikiOpened}
                onClose={onClose}
                title="Couverture de la série"
                size="lg"
            >
                <Stack>
                    {error && <Alert color="red">{error}</Alert>}
                    <Tabs defaultValue="volume">
                        <Tabs.List>
                            <Tabs.Tab value="volume">Un tome</Tabs.Tab>
                            <Tabs.Tab value="page">Une page</Tabs.Tab>
                            <Tabs.Tab value="wikipedia">Wikipédia</Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="volume" pt="sm">
                            <SimpleGrid cols={{ base: 3, sm: 5 }}>
                                {volumes.map((v) => (
                                    <UnstyledButton
                                        key={v.id}
                                        disabled={busy}
                                        onClick={() =>
                                            void apply({
                                                type: 'volume',
                                                volumeId: v.id,
                                            })
                                        }
                                    >
                                        <Image
                                            src={coverUrl(v.id)}
                                            radius="sm"
                                            alt=""
                                        />
                                        <Text size="xs" ta="center">
                                            {v.label}
                                        </Text>
                                    </UnstyledButton>
                                ))}
                            </SimpleGrid>
                        </Tabs.Panel>

                        <Tabs.Panel value="page" pt="sm">
                            <Group align="flex-start" wrap="nowrap">
                                <Stack style={{ flex: 1 }}>
                                    <Select
                                        label="Tome"
                                        allowDeselect={false}
                                        value={String(volumeId)}
                                        onChange={(value) => {
                                            setVolumeId(Number(value));
                                            setPage(1);
                                        }}
                                        data={volumes.map((v) => ({
                                            value: String(v.id),
                                            label: v.label,
                                        }))}
                                    />
                                    <NumberInput
                                        label="Page"
                                        min={1}
                                        max={volume?.pageCount ?? 1}
                                        value={page}
                                        onChange={(value) =>
                                            setPage(Number(value) || 1)
                                        }
                                    />
                                    <Button
                                        loading={busy}
                                        disabled={!volume}
                                        onClick={() =>
                                            volume &&
                                            void apply({
                                                type: 'volume',
                                                volumeId: volume.id,
                                                page: page - 1,
                                            })
                                        }
                                    >
                                        Utiliser cette page
                                    </Button>
                                </Stack>
                                {volume && (
                                    <Image
                                        src={pageUrl(volume.id, page - 1)}
                                        w={160}
                                        radius="sm"
                                        alt={`Page ${page}`}
                                    />
                                )}
                            </Group>
                        </Tabs.Panel>

                        <Tabs.Panel value="wikipedia" pt="sm">
                            <Stack align="flex-start">
                                <Text size="sm" c="dimmed">
                                    L’image de l’article Wikipédia de la série
                                    (souvent un logo ou la couverture du premier
                                    tome).
                                </Text>
                                <Button onClick={wiki.open}>
                                    Chercher sur Wikipédia…
                                </Button>
                            </Stack>
                        </Tabs.Panel>
                    </Tabs>
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            loading={busy}
                            onClick={() => void apply({ type: 'default' })}
                        >
                            Revenir à la couverture du premier tome
                        </Button>
                    </Group>
                </Stack>
            </Modal>
            <WikipediaSearch
                opened={wikiOpened}
                onClose={wiki.close}
                kind={kind}
                initialQuery={seriesName}
                actionLabel="Utiliser son image"
                onPick={(details) =>
                    details.coverUrl
                        ? void apply({ type: 'url', url: details.coverUrl })
                        : setError('Cet article n’a pas d’image.')
                }
            />
        </>
    );
};
