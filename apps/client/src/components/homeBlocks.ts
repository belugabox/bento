import { readingStateOf, sortSeries } from '@/components/seriesFilters';
import { forYou } from '@/components/suggestions';
import type {
    FamilyReader,
    InProgressVolume,
    SeriesSummary,
} from '@/services/api';

/** Bien notée, jamais ouverte (serveur) : sa note et son nombre d'avis. */
export type Gem = { id: number; rating: number; reviews: number };

/**
 * Blocs de l'accueil, dans cet ordre ; une série n'est que dans le premier.
 * `reasons` : la raison de chaque suggestion « Pour toi ».
 */
export const homeBlocks = (
    series: SeriesSummary[],
    inProgress: Pick<InProgressVolume, 'seriesId'>[],
    readers: Pick<FamilyReader, 'id' | 'seriesIds'>[],
    { gems = [], now }: { gems?: Gem[]; now?: number } = {},
) => {
    const shown = new Set(inProgress.map((v) => v.seriesId));
    const take = (list: SeriesSummary[]) => {
        const kept = list.filter((s) => !shown.has(s.id));
        for (const s of kept) shown.add(s.id);
        return kept;
    };
    const readersOf = (s: SeriesSummary) =>
        readers.filter((r) => r.seriesIds.includes(s.id));
    const fresh = take(
        sortSeries(
            series.filter((s) => (s.newCount ?? 0) > 0),
            'lastRead',
        ),
    );
    const toRead = take(
        sortSeries(
            // Déjà lues : plus à lire.
            series.filter((s) => s.toRead && readingStateOf(s) !== 'read'),
            'recent',
        ),
    );
    // D'après ce que la personne lit (rien sans lecture).
    const suggested = forYou(series, { limit: 50, now });
    const reasons = new Map(suggested.map((s) => [s.series.id, s.reason]));
    const mine = take(suggested.map((s) => s.series));
    // Lues par d'autres, pas commencées : les plus lues d'abord.
    const family = take(
        sortSeries(
            series.filter(
                (s) => s.startedCount === 0 && readersOf(s).length > 0,
            ),
            'recent',
        ).sort((a, b) => readersOf(b).length - readersOf(a).length),
    );
    const byId = new Map(series.map((s) => [s.id, s]));
    const rated = take(
        gems.flatMap((gem) => {
            const found = byId.get(gem.id);
            return found ? [found] : [];
        }),
    );
    const recent = take(sortSeries(series, 'recent'));
    return {
        fresh,
        toRead,
        forYou: mine,
        family,
        gems: rated,
        recent,
        reasons,
    };
};
