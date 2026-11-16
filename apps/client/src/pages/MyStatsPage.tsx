import { ReaderStatsView } from '@/components/stats/ReaderStatsView';
import { fetchMyStats, fetchMyYear } from '@/services/api';

/**
 * « Mes statistiques », pour chacun : sa lecture et le bilan de son année
 * (seulement les séries qu'il voit).
 */
export const MyStatsPage = () => (
    <ReaderStatsView
        title="Mes statistiques"
        loadSheet={fetchMyStats}
        loadYear={fetchMyYear}
    />
);
