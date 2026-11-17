import { formatDuration } from '@/components/format';
import { fetchMyStats } from '@/services/api';
import { useQuery } from '@/services/useQuery';

/**
 * Lecture de la semaine, en une ligne : « 3 h 20 de lecture cette semaine ·
 * 2 tomes finis » ; rien tant qu'elle n'est pas chargée.
 */
export const useWeekLabel = () => {
    const { data } = useQuery(() => fetchMyStats('7d'), [], {
        cacheKey: 'home:week',
    });
    if (!data) return undefined;
    if (data.seconds <= 0) return 'Pas encore de lecture cette semaine';
    const volumes = data.completed;
    return `${formatDuration(data.seconds)} de lecture cette semaine${
        volumes > 0
            ? ` · ${volumes} tome${volumes > 1 ? 's' : ''} fini${volumes > 1 ? 's' : ''}`
            : ''
    }`;
};
