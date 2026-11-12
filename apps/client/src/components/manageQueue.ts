// Liste de la page Séries quand on en ouvre une (« Remplir », « Modifier »),
// gardée le temps de l'onglet : l'éditeur passe à la suivante dans le même
// ordre, avec les mêmes filtres, et y revient.
const KEY = 'bento:manage';

/** Séries affichées, dans l'ordre, et l'adresse de la page (filtres, tri). */
export type ManageQueue = {
    items: { id: number; name: string }[];
    search: string;
};

export const saveManageQueue = (queue: ManageQueue) => {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(queue));
    } catch {
        // Stockage indisponible : pas de « Suivante ».
    }
};

export const readManageQueue = (): ManageQueue | null => {
    try {
        const saved = sessionStorage.getItem(KEY);
        return saved ? (JSON.parse(saved) as ManageQueue) : null;
    } catch {
        return null;
    }
};

/**
 * Place de la série dans la liste (« 3 / 12 ») et la suivante (après la
 * dernière : la première) ; pas de suivante seule dans la liste.
 */
export const queuePosition = (queue: ManageQueue | null, seriesId: number) => {
    if (!queue) return null;
    const index = queue.items.findIndex((s) => s.id === seriesId);
    const next =
        queue.items.length > 1 || index === -1
            ? queue.items[(index + 1) % queue.items.length]
            : undefined;
    return {
        position: index === -1 ? null : index + 1,
        total: queue.items.length,
        next: next && next.id !== seriesId ? next : undefined,
    };
};
