import {
    ActionIcon,
    Alert,
    Box,
    Button,
    Center,
    Group,
    Loader,
    Popover,
    SegmentedControl,
    Slider,
    Stack,
    Text,
} from '@mantine/core';
import { useLocalStorage, useMediaQuery } from '@mantine/hooks';
import {
    IconArrowLeft,
    IconSettings,
    IconZoomIn,
    IconZoomOut,
    IconZoomReset,
} from '@tabler/icons-react';
import {
    type CSSProperties,
    type MouseEvent,
    type PointerEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
    type ReactZoomPanPinchRef,
    TransformComponent,
    TransformWrapper,
} from 'react-zoom-pan-pinch';

import {
    fetchPageSizes,
    fetchVolume,
    pageUrl,
    saveProgress,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

import {
    type Direction,
    type Fit,
    type Move,
    clampPage,
    doubleSpreads,
    moveForKey,
    moveForSide,
    moveForSwipe,
    pagesToPreload,
    sideOfTap,
    singleSpreads,
    spreadIndexOf,
} from './navigation';

/** Une page ou deux par écran ; `auto` : deux en paysage. */
type PageMode = 'auto' | 'single' | 'double';

/** Taille de chaque image selon l'ajustement et le nombre de pages affichées. */
const imageStyle = (fit: Fit, count: number): CSSProperties => {
    switch (fit) {
        case 'screen':
            return {
                maxWidth: `${100 / count}vw`,
                maxHeight: '100dvh',
                objectFit: 'contain',
            };
        case 'width':
            return { width: `${100 / count}vw`, height: 'auto' };
        case 'height':
            return { height: '100dvh', width: 'auto' };
    }
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
    const [pageMode, setPageMode] = useLocalStorage<PageMode>({
        key: 'bento:reader:pages',
        defaultValue: 'auto',
    });
    // Sens réglable par série ; par défaut celui renvoyé par le serveur.
    const [directions, setDirections] = useLocalStorage<
        Record<string, Direction>
    >({ key: 'bento:reader:directions', defaultValue: {} });
    const [toolbar, setToolbar] = useState(true);
    const [ended, setEnded] = useState(false);
    const [zoomed, setZoomed] = useState(false);
    const zoom = useRef<ReactZoomPanPinchRef>(null);

    const landscape = useMediaQuery('(orientation: landscape)') ?? false;
    const wantDouble =
        pageMode === 'double' || (pageMode === 'auto' && landscape);
    // Dimensions des pages : seulement pour la double page.
    const { data: sizes } = useQuery(
        () => (wantDouble ? fetchPageSizes(volumeId) : Promise.resolve(null)),
        [volumeId, wantDouble],
    );

    const pageCount = volume?.pageCount ?? 0;
    const spreads =
        wantDouble && sizes && sizes.length === pageCount
            ? doubleSpreads(sizes)
            : singleSpreads(pageCount);

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
    const spreadIndex = spreadIndexOf(spreads, page);
    const shown = spreads[spreadIndex] ?? [page];
    // Dernière page affichée : c'est elle qui compte pour la progression.
    const lastShown = Math.max(...shown);
    const direction =
        (volume && directions[volume.seriesId]) ?? volume?.direction ?? 'ltr';

    const goTo = useCallback(
        (next: number) => {
            setEnded(false);
            // Page affichée en partant de 1 dans l'adresse.
            setParams(
                { page: String(clampPage(next, pageCount) + 1) },
                { replace: true },
            );
        },
        [pageCount, setParams],
    );

    const move = useCallback(
        (to: Move) => {
            if (!volume) return;
            if (to === 'next') {
                const next = spreads[spreadIndex + 1];
                if (next) goTo(next[0]!);
                else setEnded(true);
            } else if (ended) {
                setEnded(false);
            } else if (spreadIndex > 0) {
                goTo(spreads[spreadIndex - 1]![0]!);
            } else if (volume.previousId) {
                navigate(`/read/${volume.previousId}?page=${LAST_PAGE}`);
            }
        },
        [volume, spreads, spreadIndex, ended, goTo, navigate],
    );

    // L'adresse garde toujours un numéro de page (reprise après rechargement).
    useEffect(() => {
        if (volume && (rawPage === LAST_PAGE || rawPage === null)) goTo(page);
    }, [volume, rawPage, page, goTo]);

    // Enregistrer chaque page atteinte (une fois l'adresse fixée).
    const savedPage = useRef<string>(undefined);
    useEffect(() => {
        if (!volume || rawPage === null || rawPage === LAST_PAGE) return;
        const key = `${volume.id}:${lastShown}`;
        if (savedPage.current === key) return;
        savedPage.current = key;
        saveProgress(volume.id, { page: lastShown }).catch(() => {
            // Sans réseau, la lecture continue ; la page suivante réessaiera.
            savedPage.current = undefined;
        });
    }, [volume, rawPage, lastShown]);

    // Nouvelle page : revenir à la taille normale.
    useEffect(() => {
        zoom.current?.resetTransform(0);
        setZoomed(false);
    }, [page, fit]);

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
        for (const index of pagesToPreload(lastShown, pageCount, {
            ahead: 4,
            behind: 2,
        })) {
            new Image().src = pageUrl(volume.id, index);
        }
    }, [volume, lastShown, pageCount]);

    // --- Gestes : balayage et toucher ---------------------------------------
    const gesture = useRef<{
        x: number;
        y: number;
        // Plusieurs doigts (pincement) : pas un balayage.
        multi: boolean;
        swiped: boolean;
    }>({ x: 0, y: 0, multi: false, swiped: false });
    const pointers = useRef(new Set<number>());

    const onPointerDown = (event: PointerEvent) => {
        pointers.current.add(event.pointerId);
        if (pointers.current.size === 1) {
            gesture.current = {
                x: event.clientX,
                y: event.clientY,
                multi: false,
                swiped: false,
            };
        } else {
            gesture.current.multi = true;
        }
    };

    const onPointerUp = (event: PointerEvent) => {
        pointers.current.delete(event.pointerId);
        const { x, y, multi } = gesture.current;
        if (multi || zoomed || event.pointerType === 'mouse') return;
        const to = moveForSwipe(
            event.clientX - x,
            event.clientY - y,
            direction,
        );
        if (to) {
            gesture.current.swiped = true;
            move(to);
        }
    };

    const onClick = (event: MouseEvent) => {
        // Le clic qui suit un balayage ou un pincement ne compte pas.
        if (gesture.current.swiped || gesture.current.multi) {
            gesture.current.swiped = false;
            return;
        }
        const side = sideOfTap(event.clientX, window.innerWidth);
        if (side === 'middle' || zoomed) setToolbar((visible) => !visible);
        else move(moveForSide(side, direction));
    };

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
    // Le curseur suit le sens de lecture : de droite à gauche, la fin est à gauche.
    const sliderValue = direction === 'rtl' ? pageCount - page : page + 1;
    // Ordre à l'écran : la première page à droite en lecture droite → gauche.
    const onScreen = direction === 'rtl' ? [...shown].reverse() : shown;
    const pageLabel =
        shown.length > 1
            ? `${shown[0]! + 1}-${lastShown + 1}`
            : String(page + 1);

    const images = (
        <Box
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: fit === 'width' ? 'flex-start' : 'center',
                minHeight: '100dvh',
                width: fit === 'height' ? 'max-content' : '100vw',
                margin: '0 auto',
            }}
        >
            {onScreen.map((index) => (
                <img
                    key={index}
                    src={pageUrl(volume.id, index)}
                    alt={`Page ${index + 1}`}
                    style={{
                        display: 'block',
                        ...imageStyle(fit, shown.length),
                    }}
                    draggable={false}
                />
            ))}
        </Box>
    );

    return (
        <Box
            bg="black"
            mih="100dvh"
            pos="relative"
            style={{ userSelect: 'none' }}
        >
            <Box
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={(event) =>
                    pointers.current.delete(event.pointerId)
                }
                onClick={onClick}
                style={{
                    overflowX: fit === 'height' ? 'auto' : 'hidden',
                    // Écran : le zoom gère les doigts ; sinon, défilement normal.
                    touchAction: fit === 'screen' ? 'none' : 'pan-x pan-y',
                }}
            >
                {fit === 'screen' ? (
                    <TransformWrapper
                        ref={zoom}
                        minScale={1}
                        maxScale={5}
                        limitToBounds
                        wheel={{ disabled: true }}
                        doubleClick={{ disabled: true }}
                        // Sans zoom, le doigt sert à tourner les pages.
                        panning={{ disabled: !zoomed }}
                        onTransformed={(_, state) =>
                            setZoomed(state.scale > 1.01)
                        }
                    >
                        <TransformComponent
                            wrapperStyle={{ width: '100vw', height: '100dvh' }}
                        >
                            {images}
                        </TransformComponent>
                    </TransformWrapper>
                ) : (
                    images
                )}
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
                        <Group gap={4} wrap="nowrap">
                            {fit === 'screen' && (
                                <>
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        aria-label="Zoom arrière"
                                        onClick={() => zoom.current?.zoomOut()}
                                    >
                                        <IconZoomOut size={18} />
                                    </ActionIcon>
                                    {zoomed && (
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            aria-label="Taille normale"
                                            onClick={() =>
                                                zoom.current?.resetTransform()
                                            }
                                        >
                                            <IconZoomReset size={18} />
                                        </ActionIcon>
                                    )}
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        aria-label="Zoom avant"
                                        onClick={() => zoom.current?.zoomIn()}
                                    >
                                        <IconZoomIn size={18} />
                                    </ActionIcon>
                                </>
                            )}
                            <Popover position="bottom-end" withinPortal>
                                <Popover.Target>
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        aria-label="Réglages de lecture"
                                    >
                                        <IconSettings size={18} />
                                    </ActionIcon>
                                </Popover.Target>
                                <Popover.Dropdown>
                                    <Stack gap="xs">
                                        <Text size="xs" c="dimmed">
                                            Sens de lecture (cette série)
                                        </Text>
                                        <SegmentedControl
                                            size="xs"
                                            fullWidth
                                            value={direction}
                                            onChange={(value) =>
                                                setDirections((current) => ({
                                                    ...current,
                                                    [volume.seriesId]:
                                                        value as Direction,
                                                }))
                                            }
                                            data={[
                                                {
                                                    value: 'ltr',
                                                    label: 'Gauche → droite',
                                                },
                                                {
                                                    value: 'rtl',
                                                    label: 'Droite → gauche',
                                                },
                                            ]}
                                        />
                                        <Text size="xs" c="dimmed">
                                            Pages par écran
                                        </Text>
                                        <SegmentedControl
                                            size="xs"
                                            fullWidth
                                            value={pageMode}
                                            onChange={(value) =>
                                                setPageMode(value as PageMode)
                                            }
                                            data={[
                                                {
                                                    value: 'auto',
                                                    label: 'Auto',
                                                },
                                                {
                                                    value: 'single',
                                                    label: 'Une',
                                                },
                                                {
                                                    value: 'double',
                                                    label: 'Deux',
                                                },
                                            ]}
                                        />
                                        <Text size="xs" c="dimmed">
                                            Ajustement
                                        </Text>
                                        <SegmentedControl
                                            size="xs"
                                            fullWidth
                                            value={fit}
                                            onChange={(value) =>
                                                setFit(value as Fit)
                                            }
                                            data={[
                                                {
                                                    value: 'screen',
                                                    label: 'Écran',
                                                },
                                                {
                                                    value: 'width',
                                                    label: 'Largeur',
                                                },
                                                {
                                                    value: 'height',
                                                    label: 'Hauteur',
                                                },
                                            ]}
                                        />
                                    </Stack>
                                </Popover.Dropdown>
                            </Popover>
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
                            {pageLabel} / {pageCount}
                        </Text>
                    </Group>
                </>
            )}
        </Box>
    );
};
