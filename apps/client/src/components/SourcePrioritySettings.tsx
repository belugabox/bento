import {
    Alert,
    Group,
    Paper,
    SegmentedControl,
    Stack,
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

const SITES = METADATA_SOURCES.map((site) => ({
    value: site,
    label: SOURCE_LABELS[site],
}));

/**
 * Site préféré pour chaque champ d'une fiche de série (admin) : quand les
 * deux fiches en donnent une valeur pour un champ vide, la comparaison
 * propose d'office celle de ce site. Enregistré à chaque changement.
 */
export const SourcePrioritySettings = ({
    priority,
    onSaved,
}: {
    priority: SourcePriority;
    onSaved: (saved: SettingsResponse) => void;
}) => {
    const [error, setError] = useState<string>();

    const change = async (field: string, site: MetadataSource) => {
        setError(undefined);
        try {
            onSaved(await saveSettings({ sourcePriority: { [field]: site } }));
        } catch (e) {
            setError((e as Error).message);
        }
    };

    return (
        <Paper withBorder p="md" radius="md">
            <Stack gap="md">
                <div>
                    <Text fw={600}>Fiches en ligne</Text>
                    <Text size="sm" c="dimmed">
                        Le site préféré pour chaque champ. Quand Manga-news et
                        Wikipédia en donnent une valeur et que le champ est
                        vide, la comparaison propose d’office celle de ce site ;
                        tu peux toujours choisir l’autre.
                    </Text>
                </div>
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
                                            data={SITES}
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
