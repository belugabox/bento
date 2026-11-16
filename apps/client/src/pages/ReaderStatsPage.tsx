import { useParams } from 'react-router';

import { ReaderStatsView } from '@/components/stats/ReaderStatsView';
import { fetchReaderStats, fetchReaderYear } from '@/services/api';

/** Fiche d'un lecteur (admin) : sa lecture, et le bilan de son année. */
export const ReaderStatsPage = () => {
    const id = Number(useParams().id);
    return (
        <ReaderStatsView
            key={id}
            back={{
                label: 'Statistiques',
                to: (period) => `/stats?period=${period}`,
            }}
            loadSheet={(period) => fetchReaderStats(id, period)}
            loadYear={(year) => fetchReaderYear(id, year)}
        />
    );
};
