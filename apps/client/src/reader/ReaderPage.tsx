import {
    ActionIcon,
    Alert,
    Box,
    Button,
    Center,
    Group,
    Loader,
    SegmentedControl,
    Slider,
    Stack,
    Text,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconArrowLeft } from '@tabler/icons-react';
import {
    type CSSProperties,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { fetchVolume, pageUrl, saveProgress } from '@/services/api';
import { useQuery } from '@/services/useQuery';

import {
    type Direction,
    type Fit,
    type Move,
    clampPage,
    moveForKey,
    moveForSide,
    pagesToPreload,
} from './navigation';

const FIT_STYLES: Record<Fit, CSSProperties> = {
    screen: { maxWidth: '100%', maxHeight: '100dvh', objectFit: 'contain' },
    width: { width: '100%', height: 'auto' },
    height: { height: '100dvh', width: 'auto' },
};

// `?page=last` : dernière page (en revenant du tome suivant).
const LAST_PAGE = 'last';

/** Lecteur plein écran d'un tome. */
export const ReaderPage = () => {
    const volumeId = Number(useParams().id);
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const { data: volume, error } = useQuery(
        () => fetchVolume(volumeId),
        [volumeId],
    );

    const [fit, setFit] = useLocalStorage<Fit>({
        key: 'bento:reader:fit',
        defaultValue: 'screen',
    });
    // Sens réglable par série ; par défaut celui de la bibliothèque.
    const [directions, setDirections] = useLocalStorage<
        Record<string, Direction>
    >({ key: 'bento:reader:directions', defaultValue: {} });
    const [toolbar, setToolbar] = useState(true);
    const [ended, setEnded] = useState(false);

    const pageCount = volume?.pageCount ?? 0;
    const rawPage = params.get('page');
    // Sans page dans l'adresse : reprendre là où la personne s'était arrêtée.
    const resumePage =
        volume?.progress && !volume.progress.completed
            ? volume.progress.page
            : 0;
    const page =
        rawPage === LAST_PAGE
            ? pageCount - 1
            : rawPage === null
              ? clampPage(resumePage, pageCount)
              : clampPage(Number(rawPage) - 1, pageCount);
    const direction =
        (volume && directions[volume.seriesId]) ?? volume?.direction ?? 'rtl';

    const goTo = useCallback(
        (next: number) => {
            setEnded(false);
            // Page affichée en partant de 1 dans l'adresse.
            setParams(
                { page: String(clampPage(next, pageCount) + 1) },
                {
                    replace: true,
                },
            );
        },
        [pageCount, setParams],
    );

    const move = useCallback(
        (to: Move) => {
            if (!volume) return;
            if (to === 'next') {
                if (page < pageCount - 1) goTo(page + 1);
                else setEnded(true);
            } else if (ended) {
                setEnded(false);
            } else if (page > 0) {
                goTo(page - 1);
            } else if (volume.previousId) {
                navigate(`/read/${volume.previousId}?page=${LAST_PAGE}`);
            }
        },
        [volume, page, pageCount, ended, goTo, navigate],
    );

    // L'adresse garde toujours un numéro de page (reprise après rechargement).
    useEffect(() => {
        if (volume && (rawPage === LAST_PAGE || rawPage === null)) goTo(page);
    }, [volume, rawPage, page, goTo]);

    // Enregistrer chaque page atteinte (une fois l'adresse fixée).
    const savedPage = useRef<string>(undefined);
    useEffect(() => {
        if (!volume || rawPage === null || rawPage === LAST_PAGE) return;
        const key = `${volume.id}:${page}`;
        if (savedPage.current === key) return;
        savedPage.current = key;
        saveProgress(volume.id, { page }).catch(() => {
            // Sans réseau, la lecture continue ; la page suivante réessaiera.
            savedPage.current = undefined;
        });
    }, [volume, rawPage, page]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && volume) {
                navigate(`/series/${volume.seriesId}`);
                return;
            }
            const to = moveForKey(event.key, direction);
            if (to) {
                event.preventDefault();
                move(to);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [direction, move, navigate, volume]);

    // Précharger les pages voisines (cache du navigateur).
    useEffect(() => {
        if (!volume) return;
        for (const index of pagesToPreload(page, pageCount)) {
            new Image().src = pageUrl(volume.id, index);
        }
    }, [volume, page, pageCount]);

    if (error) {
        return (
            <Center h="100dvh" p="md">
                <Alert color="red">{error.message}</Alert>
            </Center>
        );
    }
    if (!volume) {
        return (
            <Center h="100dvh">
                <Loader />
            </Center>
        );
    }

    const title = `${volume.seriesName} — ${volume.number ? `Tome ${volume.number}` : (volume.title ?? '')}`;
    // Le curseur suit le sens de lecture : en manga, la fin est à gauche.
    const sliderValue = direction === 'rtl' ? pageCount - page : page + 1;

    return (
        <Box
            bg="black"
            mih="100dvh"
            pos="relative"
            style={{ userSelect: 'none' }}
        >
            <Box
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: fit === 'width' ? 'flex-start' : 'center',
                    minHeight: '100dvh',
                    overflowX: fit === 'height' ? 'auto' : 'hidden',
                }}
            >
                <img
                    key={page}
                    src={pageUrl(volume.id, page)}
                    alt={`Page ${page + 1}`}
                    style={{ display: 'block', ...FIT_STYLES[fit] }}
                    draggable={false}
                />
            </Box>

            {/* Zones de clic : un tiers de chaque côté, le milieu affiche la barre. */}
            <Box
                pos="fixed"
                inset={0}
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}
            >
                <Box onClick={() => move(moveForSide('left', direction))} />
                <Box onClick={() => setToolbar((shown) => !shown)} />
                <Box onClick={() => move(moveForSide('right', direction))} />
            </Box>

            {ended && (
                <Center pos="fixed" inset={0} style={{ pointerEvents: 'none' }}>
                    <Stack
                        align="center"
                        p="lg"
                        bg="rgba(0,0,0,0.85)"
                        style={{ borderRadius: 8, pointerEvents: 'auto' }}
                    >
                        <Text c="white">Fin du tome</Text>
                        {volume.nextId ? (
                            <Button
                                component={Link}
                                to={`/read/${volume.nextId}`}
                            >
                                Tome suivant
                            </Button>
                        ) : (
                            <Text c="dimmed" size="sm">
                                Dernier tome de la série
                            </Text>
                        )}
                        <Button
                            variant="default"
                            component={Link}
                            to={`/series/${volume.seriesId}`}
                        >
                            Retour à la série
                        </Button>
                    </Stack>
                </Center>
            )}

            {toolbar && (
                <>
                    <Group
                        pos="fixed"
                        top={0}
                        left={0}
                        right={0}
                        p="xs"
                        justify="space-between"
                        wrap="nowrap"
                        bg="rgba(0,0,0,0.75)"
                    >
                        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                            <ActionIcon
                                component={Link}
                                to={`/series/${volume.seriesId}`}
                                variant="subtle"
                                color="gray"
                                aria-label="Retour à la série"
                            >
                                <IconArrowLeft size={18} />
                            </ActionIcon>
                            <Text c="white" size="sm" lineClamp={1}>
                                {title}
                            </Text>
                        </Group>
                        <Group gap="xs" wrap="nowrap">
                            <SegmentedControl
                                size="xs"
                                value={direction}
                                onChange={(value) =>
                                    setDirections((current) => ({
                                        ...current,
                                        [volume.seriesId]: value as Direction,
                                    }))
                                }
                                data={[
                                    { value: 'rtl', label: '← Manga' },
                                    { value: 'ltr', label: 'BD →' },
                                ]}
                            />
                            <SegmentedControl
                                size="xs"
                                value={fit}
                                onChange={(value) => setFit(value as Fit)}
                                data={[
                                    { value: 'screen', label: 'Écran' },
                                    { value: 'width', label: 'Largeur' },
                                    { value: 'height', label: 'Hauteur' },
                                ]}
                            />
                        </Group>
                    </Group>

                    <Group
                        pos="fixed"
                        bottom={0}
                        left={0}
                        right={0}
                        p="sm"
                        wrap="nowrap"
                        bg="rgba(0,0,0,0.75)"
                    >
                        <Slider
                            style={{ flex: 1 }}
                            min={1}
                            max={Math.max(pageCount, 1)}
                            value={sliderValue}
                            onChange={(value) =>
                                goTo(
                                    direction === 'rtl'
                                        ? pageCount - value
                                        : value - 1,
                                )
                            }
                            label={null}
                            color="gray"
                        />
                        <Text
                            c="white"
                            size="sm"
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            {page + 1} / {pageCount}
                        </Text>
                    </Group>
                </>
            )}
        </Box>
    );
};
