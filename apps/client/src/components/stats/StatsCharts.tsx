import { BarChart } from '@mantine/charts';
import '@mantine/charts/styles.css';
import {
    Box,
    Group,
    Progress,
    ScrollArea,
    SegmentedControl,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useEffect, useRef } from 'react';

import { formatDuration } from '@/components/format';

import {
    type CalendarDay,
    type DailyRow,
    READER_COLORS,
    STATS_PERIODS,
    type StatsPeriod,
    WEEKDAYS,
    activityRows,
    calendarWeeks,
    hourGrid,
    monthLabel,
} from './statsData';

/** Couleur d'une case : la couleur du thème, plus ou moins soutenue. */
const heat = (ratio: number) =>
    ratio <= 0
        ? 'var(--mantine-color-default-border)'
        : `color-mix(in srgb, var(--mantine-primary-color-filled) ${Math.round(20 + 80 * ratio)}%, transparent)`;

const longDate = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });

export const StatsSection = ({
    title,
    hint,
    children,
}: {
    title: string;
    hint?: string;
    children: React.ReactNode;
}) => (
    <Stack gap="xs">
        <div>
            <Title order={4}>{title}</Title>
            {hint && (
                <Text size="xs" c="dimmed">
                    {hint}
                </Text>
            )}
        </div>
        {children}
    </Stack>
);

/** Choix de la période, pour toute la page. */
export const PeriodControl = ({
    value,
    onChange,
}: {
    value: StatsPeriod;
    onChange: (period: StatsPeriod) => void;
}) => (
    <SegmentedControl
        aria-label="Période"
        value={value}
        onChange={(v) => onChange(v as StatsPeriod)}
        data={STATS_PERIODS.map((p) => ({ value: p.value, label: p.label }))}
    />
);

/**
 * Temps de lecture par jour, semaine ou mois de la période, une couleur
 * par lecteur.
 */
export const ActivityChart = ({
    daily,
    period,
    start,
    today,
    readers,
}: {
    daily: DailyRow[];
    period: StatsPeriod;
    start: string;
    today: string;
    readers: { id: number; name: string }[];
}) => {
    const rows = activityRows(daily, { period, start, today });
    const active = readers.filter((r) =>
        daily.some(
            (row) => row.userId === r.id && row.day >= start.slice(0, 10),
        ),
    );
    if (active.length === 0) {
        return (
            <Text size="sm" c="dimmed">
                Aucune lecture sur cette période.
            </Text>
        );
    }
    // Au-delà de 2 h par barre, l'axe compte en heures : graduations rondes
    // (« 2 h », « 4 h ») plutôt que « 4,7 h ».
    const keys = active.map((reader) => String(reader.id));
    const peak = Math.max(
        0,
        ...rows.map((row) =>
            keys.reduce((sum, key) => sum + (Number(row[key]) || 0), 0),
        ),
    );
    const inHours = peak > 120;
    const data = inHours
        ? rows.map((row) =>
              Object.fromEntries(
                  Object.entries(row).map(([key, value]) => [
                      key,
                      typeof value === 'number' ? value / 60 : value,
                  ]),
              ),
          )
        : rows;
    return (
        <BarChart
            h={240}
            data={data}
            dataKey="label"
            type="stacked"
            withLegend={active.length > 1}
            valueFormatter={(value) =>
                inHours
                    ? `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`
                    : `${Math.round(value)} min`
            }
            yAxisProps={{ width: 70 }}
            series={active.map((reader) => ({
                name: String(reader.id),
                label: reader.name,
                color: READER_COLORS[
                    readers.indexOf(reader) % READER_COLORS.length
                ]!,
            }))}
        />
    );
};

const CELL = 11;

/** Une année de lecture, un carré par jour (plus foncé : plus lu). */
export const ReadingCalendar = ({
    daily,
    today,
}: {
    daily: DailyRow[];
    today: string;
}) => {
    const weeks = calendarWeeks(daily, today);
    const label = (day: CalendarDay) =>
        `${longDate(day.day)} : ${day.seconds > 0 ? formatDuration(day.seconds) : 'pas de lecture'}`;
    // Trop large pour l'écran : les semaines récentes d'abord.
    const viewport = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const element = viewport.current;
        if (element) element.scrollLeft = element.scrollWidth;
    }, [today]);
    return (
        <ScrollArea type="auto" offsetScrollbars viewportRef={viewport}>
            <Box
                style={{
                    display: 'grid',
                    gridTemplateColumns: `auto repeat(${weeks.length}, ${CELL}px)`,
                    gridAutoRows: CELL,
                    gap: 3,
                    width: 'max-content',
                    fontSize: 10,
                }}
            >
                <span />
                {weeks.map((week, i) => (
                    <Text
                        key={i}
                        span
                        size="10px"
                        c="dimmed"
                        lh={`${CELL}px`}
                        style={{ whiteSpace: 'nowrap', overflow: 'visible' }}
                    >
                        {monthLabel(week, i)}
                    </Text>
                ))}
                {WEEKDAYS.map((weekday, d) => [
                    <Text
                        key={weekday}
                        span
                        size="10px"
                        c="dimmed"
                        lh={`${CELL}px`}
                        pr={4}
                    >
                        {d % 2 === 0 ? weekday : ''}
                    </Text>,
                    ...weeks.map((week, w) => {
                        const day = week[d];
                        return day ? (
                            <Box
                                key={`${w}-${d}`}
                                title={label(day)}
                                aria-label={label(day)}
                                role="img"
                                style={{
                                    borderRadius: 2,
                                    background: heat(day.level / 4),
                                }}
                            />
                        ) : (
                            <span key={`${w}-${d}`} />
                        );
                    }),
                ])}
            </Box>
        </ScrollArea>
    );
};

/** Moments de lecture : jour de la semaine × heure. */
export const HoursHeatmap = ({
    hours,
}: {
    hours: { weekday: number; hour: number; seconds: number }[];
}) => {
    const { grid, max } = hourGrid(hours);
    if (max === 0) {
        return (
            <Text size="sm" c="dimmed">
                Pas encore de séance dans Bento sur cette période.
            </Text>
        );
    }
    return (
        <ScrollArea type="auto" offsetScrollbars>
            <Box
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto repeat(24, minmax(8px, 1fr))',
                    gridAutoRows: 16,
                    gap: 2,
                    minWidth: 300,
                    maxWidth: 760,
                }}
            >
                <span />
                {Array.from({ length: 24 }, (_, hour) => (
                    <Text
                        key={hour}
                        span
                        size="10px"
                        c="dimmed"
                        lh="16px"
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        {hour % 6 === 0 ? `${hour} h` : ''}
                    </Text>
                ))}
                {grid.map((row, d) => [
                    <Text
                        key={WEEKDAYS[d]}
                        span
                        size="10px"
                        c="dimmed"
                        lh="16px"
                        pr={4}
                    >
                        {WEEKDAYS[d]}
                    </Text>,
                    ...row.map((seconds, hour) => {
                        const text = `${WEEKDAYS[d]} ${hour} h : ${seconds > 0 ? formatDuration(seconds) : 'rien'}`;
                        return (
                            <Box
                                key={`${d}-${hour}`}
                                title={text}
                                aria-label={text}
                                role="img"
                                style={{
                                    borderRadius: 2,
                                    background: heat(seconds / max),
                                }}
                            />
                        );
                    }),
                ])}
            </Box>
        </ScrollArea>
    );
};

/**
 * Classement en barres, les premiers d'abord : temps de lecture par défaut,
 * ou une autre valeur avec `format` (taille, nombre de séries).
 */
export const RankBars = ({
    rows,
    limit = 8,
    empty,
    format = formatDuration,
}: {
    rows: { name: string; value: number }[];
    limit?: number;
    empty: string;
    format?: (value: number) => string;
}) => {
    const shown = rows.slice(0, limit);
    const max = Math.max(1, ...shown.map((r) => r.value));
    if (shown.length === 0) {
        return (
            <Text size="sm" c="dimmed">
                {empty}
            </Text>
        );
    }
    return (
        <Stack gap={6}>
            {shown.map((row) => (
                <Group key={row.name} wrap="nowrap" gap="sm">
                    <Text size="sm" w={130} truncate="end" title={row.name}>
                        {row.name}
                    </Text>
                    <Tooltip label={format(row.value)}>
                        <Progress
                            style={{ flex: 1 }}
                            size="lg"
                            radius="sm"
                            value={(row.value / max) * 100}
                            aria-label={`${row.name} : ${format(row.value)}`}
                        />
                    </Tooltip>
                    <Text
                        size="sm"
                        w={80}
                        ta="right"
                        c="dimmed"
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        {format(row.value)}
                    </Text>
                </Group>
            ))}
        </Stack>
    );
};
