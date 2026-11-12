import {
    ActionIcon,
    Box,
    Center,
    Group,
    Popover,
    SegmentedControl,
    Select,
    Slider,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { useLocalStorage, useMediaQuery } from '@mantine/hooks';
import {
    IconArrowLeft,
    IconMaximize,
    IconMinimize,
    IconSettings,
    IconZoomIn,
    IconZoomOut,
    IconZoomReset,
} from '@tabler/icons-react';
import {
    type CSSProperties,
    type MouseEvent,
    type PointerEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { Link } from 'react-router';
import {
    type ReactZoomPanPinchRef,
    TransformComponent,
    TransformWrapper,
} from 'react-zoom-pan-pinch';

import { useQuery } from '@/services/useQuery';

import { WebtoonView } from './WebtoonView';
import { useFullscreen } from './fullscreen';
import {
    type Fit,
    type Move,
    READING_MODES,
    type ReadingMode,
    clampPage,
    doubleSpreads,
    moveForKey,
    moveForSide,
    moveForSwipe,
    navigationDirection,
    pagesToPreload,
    reversesSpreads,
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

/** Sortie du lecteur (bouton retour, Échap) ; `to` : lien du bouton. */
export type ReaderExit = { label: string; onExit: () => void; to?: string };

/**
 * Lecteur plein écran d'un tome : modes de lecture, double page, zoom,
 * gestes. La page affichée est tenue par le parent (adresse ou état).
 */
export const Reader = ({
    title,
    pageCount,
    pageSrc,
    loadSizes,
    sizesKey,
    page,
    goTo: goToPage,
    onShown,
    onBeforeFirst,
    onAfterLast,
    mode,
    onModeChange,
    modeLabel,
    exit,
    end,
    toolbarExtra,
}: {
    title: string;
    pageCount: number;
    pageSrc: (index: number) => string;
    /** Dimensions des pages : double page, ou place des pages d'un webtoon. */
    loadSizes: () => Promise<[number, number][]>;
    /** Change avec le tome (recharge les dimensions). */
    sizesKey: string;
    page: number;
    goTo: (page: number) => void;
    /** Pages affichées (la dernière compte pour la progression). */
    onShown?: (pages: number[]) => void;
    /** Retour en arrière depuis la première page (tome précédent). */
    onBeforeFirst?: () => void;
    /** Page suivante sur l'écran « Fin du tome » (tome suivant). */
    onAfterLast?: () => void;
    mode: ReadingMode;
    onModeChange: (mode: ReadingMode) => void;
    modeLabel: string;
    exit: ReaderExit;
    /** Fin du tome : ce qui suit (tome suivant, dernier tome…). */
    end: ReactNode;
    toolbarExtra?: ReactNode;
}) => {
    const [fit, setFit] = useLocalStorage<Fit>({
        key: 'bento:reader:fit',
        defaultValue: 'screen',
    });
    const [pageMode, setPageMode] = useLocalStorage<PageMode>({
        key: 'bento:reader:pages',
        defaultValue: 'auto',
    });
    const [toolbar, setToolbar] = useState(true);
    const fullscreen = useFullscreen();
    const [ended, setEnded] = useState(false);
    const [zoomed, setZoomed] = useState(false);
    const zoom = useRef<ReactZoomPanPinchRef>(null);

    const landscape = useMediaQuery('(orientation: landscape)') ?? false;
    const webtoon = mode === 'webtoon';
    const direction = navigationDirection(mode);
    const wantDouble =
        !webtoon &&
        (pageMode === 'double' || (pageMode === 'auto' && landscape));
    const needSizes = wantDouble || webtoon;
    const { data: sizes } = useQuery(
        () => (needSizes ? loadSizes() : Promise.resolve(null)),
        [sizesKey, needSizes],
    );

    const spreads =
        wantDouble && sizes && sizes.length === pageCount
            ? doubleSpreads(sizes)
            : singleSpreads(pageCount);
    const spreadIndex = spreadIndexOf(spreads, page);
    const shown = spreads[spreadIndex] ?? [page];
    const lastShown = Math.max(...shown);

    // Clé plutôt que tableau : un nouveau tableau à chaque rendu.
    const shownKey = shown.join(',');
    useEffect(
        () => onShown?.(shownKey.split(',').map(Number)),
        [onShown, shownKey],
    );

    const goTo = useCallback(
        (next: number) => {
            setEnded(false);
            goToPage(clampPage(next, pageCount));
        },
        [goToPage, pageCount],
    );

    const { onExit } = exit;

    const move = useCallback(
        (to: Move) => {
            if (to === 'next') {
                const next = spreads[spreadIndex + 1];
                if (next) goTo(next[0]!);
                else if (ended) onAfterLast?.();
                else setEnded(true);
            } else if (ended) {
                setEnded(false);
            } else if (spreadIndex > 0) {
                goTo(spreads[spreadIndex - 1]![0]!);
            } else {
                onBeforeFirst?.();
            }
        },
        [spreads, spreadIndex, ended, goTo, onBeforeFirst, onAfterLast],
    );

    // Nouvelle page : revenir à la taille normale.
    useEffect(() => {
        zoom.current?.resetTransform(0);
        setZoomed(false);
    }, [page, fit]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onExit();
                return;
            }
            const to = webtoon ? undefined : moveForKey(event.key, direction);
            if (to) {
                event.preventDefault();
                move(to);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [direction, move, onExit, webtoon]);

    // Précharger les pages voisines (cache du navigateur).
    useEffect(() => {
        // Webtoon : les pages se chargent au fil du défilement.
        if (webtoon) return;
        for (const index of pagesToPreload(lastShown, pageCount, {
            ahead: 4,
            behind: 2,
        })) {
            new Image().src = pageSrc(index);
        }
    }, [lastShown, pageCount, webtoon, pageSrc]);

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

    // Le curseur suit le sens de lecture : de droite à gauche, la fin est à gauche.
    const sliderValue = direction === 'rtl' ? pageCount - page : page + 1;
    // Ordre à l'écran : la première page à droite pour les mangas.
    const onScreen = reversesSpreads(mode) ? [...shown].reverse() : shown;
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
                    src={pageSrc(index)}
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

    const exitIcon = <IconArrowLeft size={18} />;

    return (
        <Box
            bg="black"
            mih="100dvh"
            pos="relative"
            style={{ userSelect: 'none' }}
        >
            {webtoon ? (
                <WebtoonView
                    key={sizesKey}
                    pageSrc={pageSrc}
                    sizes={sizes ?? undefined}
                    initialPage={page}
                    onPage={goTo}
                    onTap={() => setToolbar((visible) => !visible)}
                    end={end}
                />
            ) : (
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
                                wrapperStyle={{
                                    width: '100vw',
                                    height: '100dvh',
                                }}
                            >
                                {images}
                            </TransformComponent>
                        </TransformWrapper>
                    ) : (
                        images
                    )}
                </Box>
            )}

            {ended && (
                <Center pos="fixed" inset={0} style={{ pointerEvents: 'none' }}>
                    <Stack
                        align="center"
                        p="lg"
                        bg="rgba(0,0,0,0.85)"
                        style={{ borderRadius: 8, pointerEvents: 'auto' }}
                    >
                        <Text c="white">Fin du tome</Text>
                        {end}
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
                            {exit.to ? (
                                <ActionIcon
                                    component={Link}
                                    to={exit.to}
                                    variant="subtle"
                                    color="gray"
                                    aria-label={exit.label}
                                >
                                    {exitIcon}
                                </ActionIcon>
                            ) : (
                                <ActionIcon
                                    onClick={exit.onExit}
                                    variant="subtle"
                                    color="gray"
                                    aria-label={exit.label}
                                >
                                    {exitIcon}
                                </ActionIcon>
                            )}
                            <Text c="white" size="sm" lineClamp={1}>
                                {title}
                            </Text>
                        </Group>
                        <Group gap={4} wrap="nowrap">
                            {toolbarExtra}
                            {fit === 'screen' && !webtoon && (
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
                            {fullscreen.supported && (
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    aria-label={
                                        fullscreen.active
                                            ? 'Quitter le plein écran'
                                            : 'Plein écran'
                                    }
                                    onClick={fullscreen.toggle}
                                >
                                    {fullscreen.active ? (
                                        <IconMinimize size={18} />
                                    ) : (
                                        <IconMaximize size={18} />
                                    )}
                                </ActionIcon>
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
                                        <Select
                                            size="xs"
                                            label={modeLabel}
                                            allowDeselect={false}
                                            value={mode}
                                            onChange={(value) =>
                                                value &&
                                                onModeChange(
                                                    value as ReadingMode,
                                                )
                                            }
                                            data={READING_MODES}
                                            comboboxProps={{
                                                withinPortal: false,
                                            }}
                                        />
                                        {!webtoon && (
                                            <>
                                                <Text size="xs" c="dimmed">
                                                    Pages par écran
                                                </Text>
                                                <SegmentedControl
                                                    size="xs"
                                                    fullWidth
                                                    value={pageMode}
                                                    onChange={(value) =>
                                                        setPageMode(
                                                            value as PageMode,
                                                        )
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
                                            </>
                                        )}
                                        {fullscreen.supported && (
                                            <Switch
                                                size="xs"
                                                label="Plein écran à l’ouverture"
                                                checked={fullscreen.auto}
                                                onChange={(event) =>
                                                    fullscreen.setAuto(
                                                        event.currentTarget
                                                            .checked,
                                                    )
                                                }
                                            />
                                        )}
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
                        {!webtoon && (
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
                        )}
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
