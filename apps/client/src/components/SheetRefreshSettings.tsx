import {
    Alert,
    Button,
    Group,
    Paper,
    Select,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';

import { formatRelative } from '@/components/format';
import {
    type SettingsResponse,
    fetchSheetRefresh,
    runSheetRefresh,
    saveSettings,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

// Minutes entre deux fiches (10 par défaut ; 5 au moins, côté serveur).
const PACES = [5, 10, 15, 20, 30, 60];

const timeLabel = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', {
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
    });

/**
 * Mise à jour des fiches liées aux séries (Manga-news, Bedetheque), la
 * nuit et très lentement : la note est mise à jour, les autres changements
 * sont signalés sur la page Séries (« Fiche à revoir »).
 */
export const SheetRefreshSettings = ({
    enabled,
    minutes,
    onSaved,
}: {
    enabled: boolean;
    /** Minutes entre deux fiches relues. */
    minutes: number;
    onSaved: (saved: SettingsResponse) => void;
}) => {
    const { data: loaded, error: loadError } = useQuery(fetchSheetRefresh, [
        enabled,
        minutes,
    ]);
    const [started, setStarted] = useState<typeof loaded>();
    const [error, setError] = useState<string>();
    const status = started ?? loaded;

    const save = async (changes: Parameters<typeof saveSettings>[0]) => {
        setError(undefined);
        try {
            onSaved(await saveSettings(changes));
        } catch (e) {
            setError((e as Error).message);
        }
    };
    const runNow = async () => {
        setError(undefined);
        try {
            setStarted(await runSheetRefresh());
        } catch (e) {
            setError((e as Error).message);
        }
    };

    return (
        <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
                <div>
                    <Text fw={600}>Mise à jour des fiches</Text>
                    <Text size="sm" c="dimmed">
                        Relit chaque mois les fiches Manga-news et Bedetheque
                        des séries : la note des lecteurs est mise à jour, les
                        autres changements (tomes, statut, résumé…) sont
                        signalés dans Séries, sans rien modifier.
                    </Text>
                </div>
                <Switch
                    label="Relire les fiches la nuit"
                    description={
                        status
                            ? `Entre ${status.night.start} h et ${status.night.end} h (heure du serveur), en alternant les sites ; arrêt de 24 h au premier refus.`
                            : undefined
                    }
                    checked={enabled}
                    onChange={(e) =>
                        void save({ sheetRefresh: e.currentTarget.checked })
                    }
                />
                <Select
                    label="Rythme"
                    description={
                        status &&
                        `Au plus ${Math.floor(((status.night.end - status.night.start) * 60) / minutes)} fiches par nuit. Plus lent, moins de risque d’être bloqué par un site.`
                    }
                    w={{ base: '100%', xs: 320 }}
                    allowDeselect={false}
                    data={[...new Set([...PACES, minutes])]
                        .sort((a, b) => a - b)
                        .map((value) => ({
                            value: String(value),
                            label: `Une fiche toutes les ${value} minutes${value === 10 ? ' (par défaut)' : ''}`,
                        }))}
                    value={String(minutes)}
                    onChange={(value) =>
                        value &&
                        void save({ sheetRefreshMinutes: Number(value) })
                    }
                />
                {status && (
                    <Stack gap={2}>
                        <Text size="sm">
                            {status.linked === 0
                                ? 'Aucune fiche liée aux séries.'
                                : status.due === 0
                                  ? `${status.linked} fiches liées, toutes relues ce mois-ci.`
                                  : `${status.due} fiches à relire sur ${status.linked}.`}
                        </Text>
                        {status.lastCheckedAt && (
                            <Text size="xs" c="dimmed">
                                Dernière fiche relue{' '}
                                {formatRelative(status.lastCheckedAt)}.
                            </Text>
                        )}
                        {status.pausedUntil && (
                            <Text size="xs" c="orange">
                                En pause jusqu’à {timeLabel(status.pausedUntil)}
                                {status.lastError
                                    ? ` : ${status.lastError}`
                                    : ''}
                            </Text>
                        )}
                    </Stack>
                )}
                {status && status.due > 0 && (
                    <Group>
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={<IconRefresh size={14} />}
                            disabled={status.running || !!status.pausedUntil}
                            onClick={() => void runNow()}
                        >
                            {status.running
                                ? 'Relecture en cours…'
                                : 'Lancer maintenant'}
                        </Button>
                        <Text size="xs" c="dimmed">
                            Même le jour, au même rythme.
                        </Text>
                    </Group>
                )}
                {(error ?? loadError) && (
                    <Alert color="red">{error ?? loadError?.message}</Alert>
                )}
            </Stack>
        </Paper>
    );
};
