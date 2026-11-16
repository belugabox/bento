// Mise en forme des statistiques de lecture : regroupement par jour,
// semaine ou mois, calendrier d'un an, grille des moments de lecture.

export const STATS_PERIODS = [
    { value: '7d', label: '7 jours' },
    { value: '30d', label: '30 jours' },
    { value: '12m', label: '12 mois' },
    { value: 'all', label: 'Tout' },
] as const;

export type StatsPeriod = (typeof STATS_PERIODS)[number]['value'];

export const DEFAULT_PERIOD: StatsPeriod = '30d';

export const isStatsPeriod = (value: string | null): value is StatsPeriod =>
    STATS_PERIODS.some((p) => p.value === value);

export type DailyRow = {
    day: string;
    userId: number;
    seconds: number;
    pages: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** « 2026-11-16 » en nombre de jours (UTC : pas de changement d'heure). */
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;
const dayString = (n: number) =>
    new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Jour local d'une date (« 2026-11-16 »). */
export const localDay = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Lundi de la semaine d'un jour. */
const mondayOf = (n: number) =>
    n - ((new Date(n * DAY_MS).getUTCDay() + 6) % 7);

const shortDate = (n: number, options: Intl.DateTimeFormatOptions) =>
    new Date(n * DAY_MS).toLocaleDateString('fr-FR', {
        ...options,
        timeZone: 'UTC',
    });

export type Bucket = 'day' | 'week' | 'month';

/** Pas du graphique : le jour sur un mois, la semaine sur un an, sinon le mois. */
export const bucketOf = (period: StatsPeriod): Bucket =>
    period === '7d' || period === '30d'
        ? 'day'
        : period === '12m'
          ? 'week'
          : 'month';

const bucketKey = (n: number, bucket: Bucket) =>
    bucket === 'day'
        ? n
        : bucket === 'week'
          ? mondayOf(n)
          : dayNumber(`${dayString(n).slice(0, 7)}-01`);

const nextBucket = (n: number, bucket: Bucket) => {
    if (bucket === 'day') return n + 1;
    if (bucket === 'week') return n + 7;
    const date = new Date(n * DAY_MS);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / DAY_MS;
};

const bucketLabel = (n: number, bucket: Bucket, period: StatsPeriod) =>
    bucket === 'month'
        ? shortDate(n, { month: 'short', year: '2-digit' })
        : period === '7d'
          ? shortDate(n, { weekday: 'short', day: 'numeric' })
          : shortDate(n, { day: 'numeric', month: 'short' });

/**
 * Lignes du graphique d'activité : une par jour, semaine ou mois de la
 * période (vides comprises), avec les minutes de chaque lecteur (clé :
 * son identifiant).
 */
export const activityRows = (
    daily: DailyRow[],
    {
        period,
        start,
        today,
    }: { period: StatsPeriod; start: string; today: string },
) => {
    const bucket = bucketOf(period);
    const last = dayNumber(today);
    const inPeriod = daily.filter((row) => row.day >= start.slice(0, 10));
    const first =
        period === 'all'
            ? inPeriod.length > 0
                ? dayNumber(inPeriod[0]!.day)
                : last
            : // Le lendemain du début : 7 jours en comptant aujourd'hui.
              dayNumber(start.slice(0, 10)) + 1;
    const rows = new Map<number, Record<string, number | string>>();
    for (
        let n = bucketKey(first, bucket);
        n <= last;
        n = nextBucket(n, bucket)
    ) {
        rows.set(n, { label: bucketLabel(n, bucket, period) });
    }
    for (const { day, userId, seconds } of inPeriod) {
        const row = rows.get(bucketKey(dayNumber(day), bucket));
        if (!row) continue;
        const key = String(userId);
        row[key] =
            Math.round(((Number(row[key]) || 0) + seconds / 60) * 10) / 10;
    }
    return [...rows.values()];
};

export type CalendarDay = {
    day: string;
    seconds: number;
    /** 0 : rien ; 1 à 4 : de peu à beaucoup (quartiles des jours lus). */
    level: number;
};

/**
 * Calendrier d'un an : 53 colonnes (semaines, du lundi au dimanche), la
 * dernière se terminant cette semaine ; les jours à venir sont `null`.
 */
export const calendarWeeks = (daily: DailyRow[], today: string) => {
    const totals = new Map<string, number>();
    for (const row of daily) {
        totals.set(row.day, (totals.get(row.day) ?? 0) + row.seconds);
    }
    const sorted = [...totals.values()]
        .filter((s) => s > 0)
        .sort((a, b) => a - b);
    const quartile = (q: number) =>
        sorted[
            Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))
        ] ?? 0;
    const limits = [quartile(0.25), quartile(0.5), quartile(0.75)];
    const level = (seconds: number) =>
        seconds <= 0 ? 0 : 1 + limits.filter((limit) => seconds > limit).length;

    const end = dayNumber(today);
    const firstMonday = mondayOf(end) - 52 * 7;
    const weeks: (CalendarDay | null)[][] = [];
    for (let monday = firstMonday; monday <= end; monday += 7) {
        const week: (CalendarDay | null)[] = [];
        for (let n = monday; n < monday + 7; n++) {
            const day = dayString(n);
            const seconds = totals.get(day) ?? 0;
            week.push(n > end ? null : { day, seconds, level: level(seconds) });
        }
        weeks.push(week);
    }
    return weeks;
};

/** Nom court du mois d'une semaine du calendrier, à son premier lundi du mois. */
export const monthLabel = (week: (CalendarDay | null)[], index: number) => {
    const first = week[0];
    if (!first) return '';
    const date = Number(first.day.slice(8, 10));
    return index === 0 || date <= 7
        ? shortDate(dayNumber(first.day), { month: 'short' })
        : '';
};

export const WEEKDAYS = [
    'lun.',
    'mar.',
    'mer.',
    'jeu.',
    'ven.',
    'sam.',
    'dim.',
];

/**
 * Moments de lecture : 7 lignes (du lundi au dimanche) de 24 heures, en
 * secondes, et le maximum (pour l'intensité).
 */
export const hourGrid = (
    hours: { weekday: number; hour: number; seconds: number }[],
) => {
    const grid = WEEKDAYS.map(() => Array.from({ length: 24 }, () => 0));
    for (const { weekday, hour, seconds } of hours) {
        // SQLite : 0 = dimanche.
        grid[(weekday + 6) % 7]![hour]! += seconds;
    }
    return { grid, max: Math.max(0, ...grid.flat()) };
};

/** Couleurs des lecteurs dans les graphiques, dans l'ordre de la liste. */
export const READER_COLORS = [
    'blue.6',
    'teal.6',
    'orange.6',
    'grape.6',
    'red.6',
    'cyan.6',
    'lime.6',
    'pink.6',
    'indigo.6',
    'yellow.6',
];
