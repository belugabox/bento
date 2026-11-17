import type { ReactNode } from 'react';

import { SeriesCardMenu } from '@/components/CardMenus';
import { CoverCard } from '@/components/CoverCard';
import {
    newBadge,
    seriesBadge,
    seriesSubtitle,
} from '@/components/seriesCardParts';
import { readingStateOf } from '@/components/seriesFilters';
import { type SeriesSummary, seriesCoverUrl } from '@/services/api';

/**
 * Carte d'une série (accueil, bibliothèque) : sa couverture, la barre
 * d'avancement d'une série commencée, l'icône « lue » ou « à lire », les
 * nouveaux tomes, et son menu.
 */
export const SeriesCard = ({
    series,
    isAdmin,
    onChanged,
    subtitle = seriesSubtitle(series),
    tag = newBadge(series.newCount),
    layout = 'card',
    coversOnly = false,
    details,
}: {
    series: SeriesSummary;
    isAdmin: boolean;
    /** Après une action du menu (recharger la page). */
    onChanged: () => void;
    subtitle?: string;
    /** En haut à gauche : nouveaux tomes par défaut. */
    tag?: ReactNode;
    layout?: 'card' | 'row';
    coversOnly?: boolean;
    /** Lignes d'infos en plus, en mode liste. */
    details?: string[];
}) => {
    const state = readingStateOf(series);
    return (
        <CoverCard
            to={`/series/${series.id}`}
            menu={
                <SeriesCardMenu
                    series={series}
                    isAdmin={isAdmin}
                    onChanged={onChanged}
                />
            }
            cover={seriesCoverUrl(series, 'small')}
            title={series.name}
            tag={tag}
            subtitle={subtitle}
            progress={
                state === 'started' && series.volumeCount > 0
                    ? series.readCount / series.volumeCount
                    : undefined
            }
            badge={seriesBadge(state, !!series.toRead)}
            layout={layout}
            coversOnly={coversOnly}
            details={details}
        />
    );
};
