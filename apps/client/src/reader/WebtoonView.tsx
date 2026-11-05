import { Box, Button, Center, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';

import { pageUrl } from '@/services/api';

// Largeur maximale des pages : lisible sur un grand écran.
const MAX_WIDTH = 900;

/**
 * Lecture d'un webtoon : toutes les pages à la suite, en défilement
 * vertical. La page la plus visible devient la page courante.
 */
export const WebtoonView = ({
    volumeId,
    sizes,
    initialPage,
    onPage,
    onTap,
    seriesId,
    nextId,
}: {
    volumeId: number;
    /** Largeur et hauteur de chaque page : la place est réservée d'avance. */
    sizes: [number, number][] | undefined;
    initialPage: number;
    onPage: (page: number) => void;
    onTap: () => void;
    seriesId: number;
    nextId: number | null;
}) => {
    const pages = useRef<(HTMLImageElement | null)[]>([]);
    // Page de départ lue une seule fois (reprise de lecture).
    const start = useRef(initialPage);

    // Reprendre à la page enregistrée, une fois la place des pages connue.
    useEffect(() => {
        if (!sizes) return;
        pages.current[start.current]?.scrollIntoView({ block: 'start' });
    }, [sizes, volumeId]);

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
                    src={pageUrl(volumeId, index)}
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
                {nextId ? (
                    <Button component={Link} to={`/read/${nextId}`}>
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
                    to={`/series/${seriesId}`}
                >
                    Retour à la série
                </Button>
            </Stack>
        </Box>
    );
};
