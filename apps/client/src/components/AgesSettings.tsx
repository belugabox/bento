import { Alert, Chip, Group, Paper, Stack, Text } from '@mantine/core';
import { useState } from 'react';

import { ageLabel, setAgeSteps } from '@/components/ageLimits';
import { type SettingsResponse, saveSettings } from '@/services/api';

// Âges proposés à la grille : de « Tout public » à 18 ans.
const AGES = Array.from({ length: 19 }, (_, age) => age);

/**
 * Grille d'âges (admin) : les âges proposés pour les séries et pour les
 * comptes. Enregistrée à chaque changement.
 */
export const AgesSettings = ({
    ages,
    onSaved,
}: {
    ages: number[];
    onSaved: (saved: SettingsResponse) => void;
}) => {
    const [error, setError] = useState<string>();

    const change = async (values: string[]) => {
        // Au moins un âge.
        if (values.length === 0) return;
        setError(undefined);
        try {
            const result = await saveSettings({ ages: values.map(Number) });
            setAgeSteps(result.settings.ages);
            onSaved(result);
        } catch (e) {
            setError((e as Error).message);
        }
    };

    return (
        <Paper withBorder p="md" radius="md">
            <Stack gap="md">
                <div>
                    <Text fw={600}>Grille d’âges</Text>
                    <Text size="sm" c="dimmed">
                        Les âges proposés pour les séries (« Âge » dans
                        l’éditeur) et pour les comptes (contrôle parental).
                        Bento garde l’âge exact ; le ComicInfo reçoit la
                        classification la plus proche, plus stricte (12+ y
                        devient « Teen », 13 ans), pour les autres lecteurs.
                    </Text>
                </div>
                <Chip.Group
                    multiple
                    value={ages.map(String)}
                    onChange={(values) => void change(values)}
                >
                    <Group gap={6}>
                        {AGES.map((age) => (
                            <Chip key={age} value={String(age)} size="sm">
                                {ageLabel(age)}
                            </Chip>
                        ))}
                    </Group>
                </Chip.Group>
                {error && <Alert color="red">{error}</Alert>}
            </Stack>
        </Paper>
    );
};
