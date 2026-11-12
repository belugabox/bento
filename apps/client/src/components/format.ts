/** Taille lisible : « 12,4 Go », « 820 Mo ». */
export const formatSize = (bytes: number) => {
    const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    const digits = value >= 100 || unit === 0 ? 0 : 1;
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: digits })} ${units[unit]}`;
};

/** Nombre avec séparateur de milliers : « 12 345 ». */
export const formatNumber = (value: number) => value.toLocaleString('fr-FR');

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

/** Date relative : « il y a 3 heures », « hier ». */
export const formatRelative = (iso: string | null, now = Date.now()) => {
    if (!iso) return 'jamais';
    const seconds = (new Date(iso).getTime() - now) / 1000;
    const steps: [Intl.RelativeTimeFormatUnit, number][] = [
        ['year', 365 * 24 * 3600],
        ['month', 30 * 24 * 3600],
        ['week', 7 * 24 * 3600],
        ['day', 24 * 3600],
        ['hour', 3600],
        ['minute', 60],
    ];
    for (const [unit, size] of steps) {
        if (Math.abs(seconds) >= size) {
            return relative.format(Math.round(seconds / size), unit);
        }
    }
    return 'à l’instant';
};

/** Durée lisible : « 0 min », « 35 min », « 2,5 h », « 246 h ». */
export const formatDuration = (seconds: number) => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = seconds / 3600;
    return `${hours.toLocaleString('fr-FR', {
        maximumFractionDigits: hours < 10 ? 1 : 0,
    })} h`;
};

/** Note des lecteurs, sur 5 : « ★ 4,4 ». */
export const ratingLabel = (rating: number) =>
    `★ ${rating.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}`;
