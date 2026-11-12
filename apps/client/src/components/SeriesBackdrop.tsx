import { Box } from '@mantine/core';

import { rgba, useCoverColor } from '@/components/coverColor';

// S'efface vers le bas : la page reprend sa couleur.
const FADE = 'linear-gradient(to bottom, black 35%, transparent)';

/**
 * Fond de la tête d'une fiche série, pleine largeur sous l'en-tête : la
 * bannière choisie, sinon la couverture floutée ; teinté de la couleur de
 * la couverture. Décoratif : placé hors du contenu (qui passe devant).
 */
export const SeriesBackdrop = ({
    coverUrl,
    bannerUrl,
}: {
    coverUrl?: string;
    bannerUrl?: string;
}) => {
    const color = useCoverColor(coverUrl);
    return (
        <Box
            aria-hidden
            data-testid="series-backdrop"
            style={{
                position: 'absolute',
                top: 'var(--app-shell-header-offset, 56px)',
                left: 0,
                right: 0,
                height: bannerUrl ? 320 : 380,
                overflow: 'hidden',
                pointerEvents: 'none',
                zIndex: 0,
                maskImage: FADE,
                WebkitMaskImage: FADE,
            }}
        >
            {bannerUrl ? (
                <img
                    src={bannerUrl}
                    alt=""
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center 30%',
                    }}
                />
            ) : (
                coverUrl && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: -60,
                            backgroundImage: `url("${coverUrl}")`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            filter: 'blur(40px) saturate(1.3)',
                            opacity: 0.35,
                        }}
                    />
                )
            )}
            {color && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: `linear-gradient(to bottom, ${rgba(color, bannerUrl ? 0.2 : 0.35)}, ${rgba(color, 0)})`,
                    }}
                />
            )}
        </Box>
    );
};
