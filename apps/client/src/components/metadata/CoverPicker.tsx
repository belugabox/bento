import {
    Alert,
    AspectRatio,
    Box,
    Button,
    FileButton,
    Group,
    Image,
    Modal,
    Paper,
    SegmentedControl,
    Select,
    SimpleGrid,
    Stack,
    Tabs,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPhotoUp } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import type { CoverPosition, CoverSource } from '@/services/api';

import { SeriesSearch } from './SeriesSearch';

/** Tome (série publiée) ou fichier (brouillon) où prendre une couverture. */
export type CoverVolume = {
    key: string;
    label: string;
    pageCount: number;
    /** Vignette du tome. */
    cover: string;
    page: (index: number) => string;
    /** Source envoyée au serveur : le tome, ou une de ses pages. */
    source: (page?: number) => CoverSource;
};

/** Image choisie, en attente de confirmation (avec son cadrage). */
type Candidate = {
    id: string;
    src: string;
    source: CoverSource;
    label: string;
};

const POSITIONS: { value: CoverPosition; label: string }[] = [
    { value: 'top', label: 'Haut' },
    { value: 'center', label: 'Centre' },
    { value: 'bottom', label: 'Bas' },
];

// Pages affichées à la fois (des images en taille réelle).
const PAGE_BATCH = 24;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const objectPosition = (position: CoverPosition) =>
    position === 'center' ? 'center' : `center ${position}`;

const readAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
            resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
        reader.onerror = () => reject(new Error('Image illisible'));
        reader.readAsDataURL(file);
    });

/** Vignette cliquable, entourée quand elle est choisie. */
const Thumb = ({
    src,
    label,
    selected,
    onClick,
}: {
    src: string;
    label: string;
    selected: boolean;
    onClick: () => void;
}) => (
    <UnstyledButton onClick={onClick} aria-pressed={selected}>
        <AspectRatio ratio={2 / 3}>
            <Image
                src={src}
                radius="sm"
                fit="cover"
                alt=""
                loading="lazy"
                style={{
                    outline: selected
                        ? '3px solid var(--mantine-primary-color-filled)'
                        : undefined,
                }}
            />
        </AspectRatio>
        <Text size="xs" ta="center" lineClamp={1}>
            {label}
        </Text>
    </UnstyledButton>
);

/**
 * Choix de la couverture d'une série (ou de la future série d'un dossier de
 * brouillons) : un tome, une page, une image de l'appareil ou d'une fiche en ligne,
 * recadrée en 2:3 en gardant le haut, le centre ou le bas.
 */
export const CoverPicker = ({
    opened,
    onClose,
    seriesName,
    kind,
    volumes,
    current,
    save,
    onChanged,
}: {
    opened: boolean;
    onClose: () => void;
    seriesName: string;
    kind: 'manga' | 'comics';
    volumes: CoverVolume[];
    /** Couverture actuelle. */
    current?: string;
    save: (source: CoverSource) => Promise<unknown>;
    onChanged: () => void;
}) => {
    const [volumeKey, setVolumeKey] = useState(volumes[0]?.key);
    const [shownPages, setShownPages] = useState(PAGE_BATCH);
    const [candidate, setCandidate] = useState<Candidate>();
    const [position, setPosition] = useState<CoverPosition>('top');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [finderOpened, finder] = useDisclosure(false);
    const volume = volumes.find((v) => v.key === volumeKey) ?? volumes[0];

    // Image de l'appareil : son adresse locale est libérée ensuite.
    useEffect(() => {
        if (!candidate?.src.startsWith('blob:')) return;
        const src = candidate.src;
        return () => URL.revokeObjectURL(src);
    }, [candidate?.src]);

    const apply = async (source: CoverSource) => {
        setBusy(true);
        setError(undefined);
        try {
            await save(source);
            onChanged();
            setCandidate(undefined);
            onClose();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const takeFile = async (file: File | null) => {
        if (!file) return;
        setError(undefined);
        if (!file.type.startsWith('image/')) {
            setError('Ce fichier n’est pas une image.');
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setError('Image trop lourde (10 Mo au plus).');
            return;
        }
        const data = await readAsBase64(file);
        setCandidate({
            id: 'image',
            src: URL.createObjectURL(file),
            source: { type: 'image', data },
            label: file.name || 'Image collée',
        });
    };

    const pageCount = volume?.pageCount ?? 0;

    return (
        <>
            <Modal
                opened={opened && !finderOpened}
                onClose={onClose}
                title="Couverture de la série"
                size="xl"
            >
                <Stack
                    // Une image copiée peut être collée n'importe où.
                    onPaste={(event) => {
                        const file = [...event.clipboardData.files].find((f) =>
                            f.type.startsWith('image/'),
                        );
                        if (file) void takeFile(file);
                    }}
                >
                    {error && <Alert color="red">{error}</Alert>}
                    <Tabs defaultValue="volume" keepMounted={false}>
                        <Tabs.List>
                            <Tabs.Tab value="volume">Un tome</Tabs.Tab>
                            <Tabs.Tab value="page">Une page</Tabs.Tab>
                            <Tabs.Tab value="image">Une image</Tabs.Tab>
                            <Tabs.Tab value="wikipedia">En ligne</Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="volume" pt="sm">
                            <SimpleGrid
                                cols={{ base: 4, sm: 6 }}
                                mah={320}
                                style={{ overflowY: 'auto' }}
                            >
                                {volumes.map((v) => (
                                    <Thumb
                                        key={v.key}
                                        src={v.cover}
                                        label={v.label}
                                        selected={
                                            candidate?.id === `volume:${v.key}`
                                        }
                                        onClick={() =>
                                            setCandidate({
                                                id: `volume:${v.key}`,
                                                src: v.page(0),
                                                source: v.source(),
                                                label: v.label,
                                            })
                                        }
                                    />
                                ))}
                            </SimpleGrid>
                        </Tabs.Panel>

                        <Tabs.Panel value="page" pt="sm">
                            <Stack gap="xs">
                                <Select
                                    label="Tome"
                                    allowDeselect={false}
                                    value={volume?.key ?? null}
                                    onChange={(value) => {
                                        if (!value) return;
                                        setVolumeKey(value);
                                        setShownPages(PAGE_BATCH);
                                    }}
                                    data={volumes.map((v) => ({
                                        value: v.key,
                                        label: v.label,
                                    }))}
                                />
                                {volume && (
                                    <Box
                                        mah={320}
                                        style={{ overflowY: 'auto' }}
                                    >
                                        <SimpleGrid cols={{ base: 4, sm: 6 }}>
                                            {Array.from(
                                                {
                                                    length: Math.min(
                                                        shownPages,
                                                        pageCount,
                                                    ),
                                                },
                                                (_, index) => (
                                                    <Thumb
                                                        key={index}
                                                        src={volume.page(index)}
                                                        label={`Page ${index + 1}`}
                                                        selected={
                                                            candidate?.id ===
                                                            `page:${volume.key}:${index}`
                                                        }
                                                        onClick={() =>
                                                            setCandidate({
                                                                id: `page:${volume.key}:${index}`,
                                                                src: volume.page(
                                                                    index,
                                                                ),
                                                                source: volume.source(
                                                                    index,
                                                                ),
                                                                label: `${volume.label}, page ${index + 1}`,
                                                            })
                                                        }
                                                    />
                                                ),
                                            )}
                                        </SimpleGrid>
                                        {shownPages < pageCount && (
                                            <Group justify="center" mt="xs">
                                                <Button
                                                    variant="subtle"
                                                    size="xs"
                                                    onClick={() =>
                                                        setShownPages(
                                                            (n) =>
                                                                n + PAGE_BATCH,
                                                        )
                                                    }
                                                >
                                                    Pages suivantes (
                                                    {pageCount - shownPages})
                                                </Button>
                                            </Group>
                                        )}
                                    </Box>
                                )}
                            </Stack>
                        </Tabs.Panel>

                        <Tabs.Panel value="image" pt="sm">
                            <Paper
                                withBorder
                                p="lg"
                                radius="md"
                                style={{ borderStyle: 'dashed' }}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    void takeFile(
                                        event.dataTransfer.files[0] ?? null,
                                    );
                                }}
                            >
                                <Stack align="center" gap="xs">
                                    <IconPhotoUp size={32} stroke={1.5} />
                                    <Text size="sm" ta="center">
                                        Dépose une image ici, colle-la (Ctrl+V),
                                        ou
                                    </Text>
                                    <FileButton
                                        accept="image/*"
                                        onChange={(file) => void takeFile(file)}
                                    >
                                        {(props) => (
                                            <Button
                                                variant="default"
                                                {...props}
                                            >
                                                Choisir une image…
                                            </Button>
                                        )}
                                    </FileButton>
                                    <Text size="xs" c="dimmed">
                                        JPEG, PNG ou WebP, 10 Mo au plus.
                                    </Text>
                                </Stack>
                            </Paper>
                        </Tabs.Panel>

                        <Tabs.Panel value="wikipedia" pt="sm">
                            <Stack align="flex-start">
                                <Text size="sm" c="dimmed">
                                    L’image de la fiche de la série sur
                                    Manga-news (couverture du premier tome) ou
                                    Wikipédia (souvent un logo).
                                </Text>
                                <Button variant="default" onClick={finder.open}>
                                    Chercher en ligne…
                                </Button>
                            </Stack>
                        </Tabs.Panel>
                    </Tabs>

                    <Paper withBorder p="sm" radius="md">
                        <Group align="flex-start" wrap="nowrap">
                            <Stack gap={4} align="center" w={120}>
                                <Box w={120}>
                                    <AspectRatio ratio={2 / 3}>
                                        {candidate ? (
                                            <img
                                                src={candidate.src}
                                                alt="Aperçu"
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover',
                                                    objectPosition:
                                                        objectPosition(
                                                            position,
                                                        ),
                                                    borderRadius: 4,
                                                }}
                                            />
                                        ) : current ? (
                                            <Image
                                                src={current}
                                                radius="sm"
                                                fit="cover"
                                                alt="Couverture actuelle"
                                            />
                                        ) : (
                                            <Box bg="var(--mantine-color-default-hover)" />
                                        )}
                                    </AspectRatio>
                                </Box>
                                <Text size="xs" c="dimmed">
                                    {candidate ? 'Aperçu' : 'Actuelle'}
                                </Text>
                            </Stack>
                            <Stack style={{ flex: 1 }} gap="sm">
                                {candidate ? (
                                    <>
                                        <Text size="sm" lineClamp={2}>
                                            {candidate.label}
                                        </Text>
                                        <Stack gap={4}>
                                            <Text size="sm" fw={500}>
                                                Cadrage
                                            </Text>
                                            <SegmentedControl
                                                value={position}
                                                onChange={(value) =>
                                                    setPosition(
                                                        value as CoverPosition,
                                                    )
                                                }
                                                data={POSITIONS}
                                            />
                                            <Text size="xs" c="dimmed">
                                                Partie de l’image gardée pour
                                                une couverture au format 2:3.
                                            </Text>
                                        </Stack>
                                        <Group>
                                            <Button
                                                loading={busy}
                                                onClick={() =>
                                                    void apply({
                                                        ...candidate.source,
                                                        position,
                                                    })
                                                }
                                            >
                                                Utiliser cette couverture
                                            </Button>
                                            <Button
                                                variant="subtle"
                                                color="gray"
                                                onClick={() =>
                                                    setCandidate(undefined)
                                                }
                                            >
                                                Annuler
                                            </Button>
                                        </Group>
                                    </>
                                ) : (
                                    <Text size="sm" c="dimmed">
                                        Choisis un tome, une page ou une image
                                        pour voir l’aperçu et régler le cadrage.
                                    </Text>
                                )}
                            </Stack>
                        </Group>
                    </Paper>

                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            loading={busy && !candidate}
                            disabled={busy}
                            onClick={() => void apply({ type: 'default' })}
                        >
                            Revenir à la couverture du premier tome
                        </Button>
                    </Group>
                </Stack>
            </Modal>
            <SeriesSearch
                opened={finderOpened}
                onClose={finder.close}
                kind={kind}
                initialQuery={seriesName}
                actionLabel="Utiliser son image"
                onPick={(found) => {
                    if (!found.coverUrl) {
                        setError('Cette fiche n’a pas d’image.');
                        return;
                    }
                    setError(undefined);
                    setCandidate({
                        id: found.source,
                        src: found.coverUrl,
                        source: { type: 'url', url: found.coverUrl },
                        label: `${found.source === 'wikipedia' ? 'Wikipédia' : 'Manga-news'} : ${found.title}`,
                    });
                }}
            />
        </>
    );
};
