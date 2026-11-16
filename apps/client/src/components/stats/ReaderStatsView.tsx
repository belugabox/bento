import {
    Alert,
    Anchor,
    Group,
    Loader,
    Select,
    Stack,
    Tabs,
    Title,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link, useSearchParams } from 'react-router';

import { UserAvatar } from '@/components/accounts/UserAvatar';
import type { ReaderStats, YearRecap } from '@/services/api';
import { useQuery } from '@/services/useQuery';

import { ReaderSheet } from './ReaderSheet';
import { PeriodControl } from './StatsCharts';
import { YearRecapView } from './YearRecapView';
import { DEFAULT_PERIOD, type StatsPeriod, isStatsPeriod } from './statsData';

/**
 * Statistiques d'une personne : sa lecture sur une période, et le bilan
 * d'une année (onglets, période et année gardés dans l'adresse). Pour la
 * fiche vue par l'admin et pour « Mes statistiques ».
 */
export const ReaderStatsView = ({
    title,
    back,
    loadSheet,
    loadYear,
}: {
    /** Titre ; sinon le nom de la personne. */
    title?: string;
    back?: { label: string; to: (period: StatsPeriod) => string };
    loadSheet: (period: StatsPeriod) => Promise<ReaderStats>;
    loadYear: (year?: number) => Promise<YearRecap>;
}) => {
    const [params, setParams] = useSearchParams();
    const requested = params.get('period');
    const period: StatsPeriod = isStatsPeriod(requested)
        ? requested
        : DEFAULT_PERIOD;
    const tab = params.get('tab') === 'year' ? 'year' : 'reading';
    const year = Number(params.get('year')) || undefined;
    const setParam = (name: 'tab' | 'period' | 'year', value: string) =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.set(name, value);
                return next;
            },
            { replace: true },
        );

    // Chaque onglet charge ses chiffres à son ouverture.
    const sheet = useQuery(
        () =>
            tab === 'reading' ? loadSheet(period) : Promise.resolve(undefined),
        [tab, period],
    );
    const recap = useQuery(
        () => (tab === 'year' ? loadYear(year) : Promise.resolve(undefined)),
        [tab, year],
    );
    const person = sheet.data ?? recap.data?.user;
    const error = sheet.error ?? recap.error;

    return (
        <Stack gap="xl">
            <Stack gap={4}>
                {back && (
                    <Anchor component={Link} to={back.to(period)} size="sm">
                        <Group gap={4}>
                            <IconArrowLeft size={14} />
                            {back.label}
                        </Group>
                    </Anchor>
                )}
                <Group gap="sm" wrap="nowrap" mih={56}>
                    {person && (
                        <UserAvatar
                            name={person.name}
                            seed={person.avatarSeed}
                            size="lg"
                        />
                    )}
                    <Title order={2}>{title ?? person?.name}</Title>
                </Group>
            </Stack>

            <Tabs
                keepMounted={false}
                value={tab}
                onChange={(value) => value && setParam('tab', value)}
            >
                <Group justify="space-between" gap="sm">
                    <Tabs.List>
                        <Tabs.Tab value="reading">Lecture</Tabs.Tab>
                        <Tabs.Tab value="year">Bilan de l’année</Tabs.Tab>
                    </Tabs.List>
                    {tab === 'reading' ? (
                        <PeriodControl
                            value={period}
                            onChange={(value) => setParam('period', value)}
                        />
                    ) : (
                        recap.data &&
                        recap.data.years.length > 1 && (
                            <Select
                                aria-label="Année"
                                w={110}
                                allowDeselect={false}
                                value={String(recap.data.year)}
                                data={recap.data.years.map(String)}
                                onChange={(value) =>
                                    value && setParam('year', value)
                                }
                            />
                        )
                    )}
                </Group>

                <Tabs.Panel value="reading" pt="lg">
                    {error ? (
                        <Alert color="red">{error.message}</Alert>
                    ) : sheet.data ? (
                        <ReaderSheet data={sheet.data} period={period} />
                    ) : (
                        <Loader mx="auto" />
                    )}
                </Tabs.Panel>
                <Tabs.Panel value="year" pt="lg">
                    {error ? (
                        <Alert color="red">{error.message}</Alert>
                    ) : recap.data ? (
                        <YearRecapView recap={recap.data} />
                    ) : (
                        <Loader mx="auto" />
                    )}
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};
