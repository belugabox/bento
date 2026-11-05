import { Box, Center, Loader, Stack, Text } from '@mantine/core';
import { type ReactNode, useEffect, useRef } from 'react';

// Largeur maximale des pages : lisible sur un grand écran.
const MAX_WIDTH = 900;

/**
 * Lecture d'un webtoon : toutes les pages à la suite, en défilement
 * vertical. La page la plus visible devient la page courante.
 */
export const WebtoonView = ({
    pageSrc,
    sizes,
    initialPage,
    onPage,
    onTap,
    end,
}: {
    pageSrc: (index: number) => string;
    /** Largeur et hauteur de chaque page : la place est réservée d'avance. */
    sizes: [number, number][] | undefined;
    initialPage: number;
    onPage: (page: number) => void;
    onTap: () => void;
    /** Fin du tome : tome suivant, retour… */
    end: ReactNode;
}) => {
    const pages = useRef<(HTMLImageElement | null)[]>([]);
    // Page de départ lue une seule fois (reprise de lecture).
    const start = useRef(initialPage);

    // Reprendre à la page enregistrée, une fois la place des pages connue.
    useEffect(() => {
        if (!sizes) return;
        pages.current[start.current]?.scrollIntoView({ block: 'start' });
    }, [sizes]);

    // Page courante : celle qui passe la ligne à 40 % de la hauteur.
    useEffect(() => {
        if (!sizes || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        onPage(
                            Number((entry.target as HTMLElement).dataset.page),
                        );
                    }
                }
            },
            { rootMargin: '-40% 0px -60% 0px' },
        );
        for (const page of pages.current) if (page) observer.observe(page);
        return () => observer.disconnect();
    }, [sizes, onPage]);

    if (!sizes) {
        return (
            <Center h="100dvh">
                <Loader />
            </Center>
        );
    }

    return (
        <Box onClick={onTap}>
            {sizes.map(([width, height], index) => (
                <img
                    key={index}
                    ref={(element) => {
                        pages.current[index] = element;
                    }}
                    data-page={index}
                    src={pageSrc(index)}
                    alt={`Page ${index + 1}`}
                    loading="lazy"
                    draggable={false}
                    style={{
                        display: 'block',
                        width: '100%',
                        maxWidth: MAX_WIDTH,
                        margin: '0 auto',
                        aspectRatio:
                            width && height
                                ? `${width} / ${height}`
                                : undefined,
                    }}
                />
            ))}
            <Stack align="center" py={80} onClick={(e) => e.stopPropagation()}>
                <Text c="white">Fin du tome</Text>
                {end}
            </Stack>
        </Box>
    );
};
