import { SOURCE_LABELS } from '@server/types';

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

/** Nombre d'avis : « 96 avis », « 1 avis ». */
export const reviewsLabel = (count: number) =>
    `${count.toLocaleString('fr-FR')} avis`;

/**
 * Numéros de tomes, les suites regroupées : « 3, 7 à 9, 12 » (deux numéros
 * qui se suivent restent séparés : « 5, 6 »).
 */
export const numbersLabel = (numbers: number[]) => {
    const parts: string[] = [];
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length;) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
        parts.push(
            j - i >= 2
                ? `${sorted[i]} à ${sorted[j]}`
                : sorted.slice(i, j + 1).join(', '),
        );
        i = j + 1;
    }
    return parts.join(', ');
};

type PublishedCount = { site: 'manga-news' | 'bedetheque'; count: number };

/**
 * « Tomes manquants : 7, 13 à 15 (15 parus d'après Manga-news) », avec le
 * nombre des autres fiches s'il diffère (« ; Bedetheque : 18 »).
 */
export const missingVolumesLabel = ({
    published,
    others,
    missing,
}: {
    published: PublishedCount | null;
    others: PublishedCount[];
    missing: number[];
}) => {
    const sources = published
        ? ` (${[
              `${published.count} parus d’après ${SOURCE_LABELS[published.site]}`,
              ...others.map((o) => `${SOURCE_LABELS[o.site]} : ${o.count}`),
          ].join(' ; ')})`
        : '';
    return `${missing.length > 1 ? 'Tomes manquants' : 'Tome manquant'} : ${numbersLabel(missing)}${sources}`;
};
