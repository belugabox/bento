// Sans dépendance à Node : partagé avec le client (via `@server/types`).

/**
 * Clé de tri d'un groupement de tomes, dans l'ordre naturel : sans
 * majuscules ni accents, les nombres comparés en nombres (« Part 2 » avant
 * « Part 10 », « 4a » avant « 4b »).
 */
export const groupSortKey = (group: string) =>
    group
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim()
        .replace(/\d+/g, (digits) => digits.padStart(8, '0'));
