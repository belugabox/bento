import { useContext } from 'react';

import { ageLimitLabel } from '@/components/ageLimits';
import { fetchHealth } from '@/services/api';
import { UserContext } from '@/services/auth';
import { useQuery } from '@/services/useQuery';

/** Mode inhabituel de l'appli : vue lecteur d'un admin, copie de la prod. */
export type AppMode = {
    key: 'preview' | 'prod-copy';
    color: 'orange' | 'grape';
    /** Court : dans la pastille de l'en-tête. */
    label: string;
    /** L'explication, dans la bulle de la pastille. */
    detail: string;
};

/**
 * Modes en cours, le plus important d'abord (la vue lecteur : rien n'y est
 * enregistré) ; aucun d'habitude.
 */
export const useAppModes = (): AppMode[] => {
    const user = useContext(UserContext);
    const { data } = useQuery(fetchHealth, [], { cacheKey: 'health' });
    const modes: AppMode[] = [];
    const preview = user?.preview;
    if (preview) {
        modes.push(
            preview.user
                ? {
                      key: 'preview',
                      color: 'orange',
                      label: `Vue de ${preview.user.name}`,
                      detail: `L’appli telle que la voit ${preview.user.name}, en lecture seule : rien n’est enregistré.`,
                  }
                : {
                      key: 'preview',
                      color: 'orange',
                      label: `Vue ${ageLimitLabel(preview.maxAge).toLowerCase()}`,
                      detail: `Vue lecteur : ${ageLimitLabel(preview.maxAge).toLowerCase()}. Les écrans d’administration sont masqués.`,
                  },
        );
    }
    if (data?.offlineLibraries) {
        modes.push({
            key: 'prod-copy',
            color: 'grape',
            label: 'Copie de la prod',
            detail: 'Les fichiers des bibliothèques sont absents : on parcourt, sans lire de tome ; aucun scan ni mise à jour des fiches.',
        });
    }
    return modes;
};
