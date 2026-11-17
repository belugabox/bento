import { sortSeries } from '@/components/seriesFilters';
import type {
    FamilyReader,
    InProgressVolume,
    SeriesSummary,
} from '@/services/api';

/** Blocs de l'accueil, dans cet ordre ; une série n'est que dans le premier. */
export const homeBlocks = (
    series: SeriesSummary[],
    inProgress: Pick<InProgressVolume, 'seriesId'>[],
    readers: Pick<FamilyReader, 'id' | 'seriesIds'>[],
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
            series.filter((s) => s.toRead),
            'recent',
        ),
    );
    // Lues par d'autres, pas commencées : les plus lues d'abord.
    const family = take(
        sortSeries(
            series.filter(
                (s) => s.startedCount === 0 && readersOf(s).length > 0,
            ),
            'recent',
        ).sort((a, b) => readersOf(b).length - readersOf(a).length),
    );
    const recent = take(sortSeries(series, 'recent'));
    return { fresh, toRead, family, recent };
};
