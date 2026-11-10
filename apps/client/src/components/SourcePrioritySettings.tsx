import {
    Alert,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Switch,
    Table,
    Text,
} from '@mantine/core';
import { useState } from 'react';

import {
    METADATA_SOURCES,
    type MetadataSource,
    SHEET_FIELDS,
    SHEET_FIELD_LABELS,
    SOURCE_LABELS,
    type SourcePriority,
} from '@server/types';

import { type SettingsResponse, saveSettings } from '@/services/api';

/** Ce que chaque site apporte, sous son interrupteur. */
const SITE_NOTES: Record<MetadataSource, string> = {
    'manga-news': 'Mangas en français : éditions VF, âge conseillé, thèmes.',
    wikipedia: 'Mangas et bandes dessinées : auteurs, années de parution.',
    bedetheque:
        'BD, comics et romans graphiques : éditeur français, one shots.',
};

/**
 * Sites des fiches en ligne (admin) : chacun peut être désactivé (ni
 * cherché, ni relu), et le site préféré pour chaque champ, quand plusieurs
 * en donnent une valeur pour un champ vide, est proposé d'office dans la
 * comparaison. Enregistré à chaque changement.
 */
export const SourcePrioritySettings = ({
    priority,
    disabled,
    onSaved,
}: {
    priority: SourcePriority;
    disabled: MetadataSource[];
    onSaved: (saved: SettingsResponse) => void;
}) => {
    const [error, setError] = useState<string>();
    const enabled = METADATA_SOURCES.filter((site) => !disabled.includes(site));

    const save = async (changes: Parameters<typeof saveSettings>[0]) => {
        setError(undefined);
        try {
            onSaved(await saveSettings(changes));
        } catch (e) {
            setError((e as Error).message);
        }
    };
    const change = (field: string, site: MetadataSource) =>
        save({ sourcePriority: { [field]: site } });
    const toggle = (site: MetadataSource, on: boolean) =>
        save({
            disabledSources: on
                ? disabled.filter((s) => s !== site)
                : [...disabled, site],
        });

    return (
        <Paper withBorder p="md" radius="md">
            <Stack gap="md">
                <div>
                    <Text fw={600}>Fiches en ligne</Text>
                    <Text size="sm" c="dimmed">
                        Les sites où « Remplir » cherche une série. Un site
                        désactivé n’est ni cherché, ni relu.
                    </Text>
                </div>
                <Stack gap="xs">
                    {METADATA_SOURCES.map((site) => (
                        <Switch
                            key={site}
                            label={SOURCE_LABELS[site]}
                            description={SITE_NOTES[site]}
                            checked={!disabled.includes(site)}
                            // Au moins un site reste actif.
                            disabled={
                                enabled.length === 1 && enabled[0] === site
                            }
                            onChange={(e) =>
                                void toggle(site, e.currentTarget.checked)
                            }
                        />
                    ))}
                </Stack>
                <Text size="sm" c="dimmed">
                    Le site préféré pour chaque champ. Quand plusieurs sites en
                    donnent une valeur et que le champ est vide, la comparaison
                    propose d’office celle de ce site ; tu peux toujours choisir
                    une autre.
                </Text>
                <Table verticalSpacing={4} withRowBorders={false}>
                    <Table.Tbody>
                        {SHEET_FIELDS.map((field) => (
                            <Table.Tr key={field}>
                                <Table.Td>
                                    <Text size="sm">
                                        {SHEET_FIELD_LABELS[field]}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Group justify="flex-end">
                                        <SegmentedControl
                                            size="xs"
                                            aria-label={`Site préféré : ${SHEET_FIELD_LABELS[field]}`}
                                            value={priority[field]}
                                            data={METADATA_SOURCES.map(
                                                (site) => ({
                                                    value: site,
                                                    label: SOURCE_LABELS[site],
                                                    disabled:
                                                        disabled.includes(site),
                                                }),
                                            )}
                                            onChange={(value) =>
                                                void change(
                                                    field,
                                                    value as MetadataSource,
                                                )
                                            }
                                        />
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
                {error && <Alert color="red">{error}</Alert>}
            </Stack>
        </Paper>
    );
};
