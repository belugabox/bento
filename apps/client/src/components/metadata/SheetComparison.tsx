import {
    Anchor,
    Button,
    Group,
    Modal,
    Radio,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import {
    type GenreEntry,
    type MetadataSource,
    SHEET_FIELD_LABELS,
    SOURCE_LABELS,
    type SheetField,
    type SourcePriority,
} from '@server/types';

import {
    type SheetChoice,
    type SheetValues,
    chosenValues,
    comparisonRows,
    defaultChoice,
    sheetValues,
} from './editing';
import type { FoundSeries } from './onlineSheets';

/** Une valeur dans une case : un long résumé n'est montré qu'en partie. */
const Value = ({ field, text }: { field: SheetField; text: string }) => (
    <Text
        size="sm"
        lineClamp={field === 'Summary' ? 4 : undefined}
        title={field === 'Summary' ? text : undefined}
        style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}
    >
        {text}
    </Text>
);

/**
 * Valeurs actuelles et celles des fiches trouvées, champ par champ : pour
 * chacun, on garde l'actuelle ou on prend celle d'une fiche. Seuls les
 * champs où une fiche apporte du nouveau sont montrés.
 */
export const SheetComparison = ({
    found,
    onClose,
    current,
    catalog,
    formats,
    order,
    priority,
    display,
    footer,
    onApply,
}: {
    /** Fiches trouvées ; la fenêtre est ouverte tant qu'il y en a. */
    found: FoundSeries[] | undefined;
    onClose: () => void;
    current: SheetValues;
    catalog: GenreEntry[];
    formats: { id: number; name: string }[];
    /** Ordre des colonnes, le site le plus utile d'abord. */
    order: MetadataSource[];
    /** Site préféré pour chaque champ (choix de départ d'un champ vide). */
    priority: SourcePriority;
    /** Texte montré pour une valeur (nom du format, libellé de l'âge…). */
    display: (field: SheetField, value: string) => string;
    footer?: ReactNode;
    onApply: (values: SheetValues) => void;
}) => {
    const sheets = useMemo(
        () =>
            [...(found ?? [])]
                .sort(
                    (a, b) => order.indexOf(a.source) - order.indexOf(b.source),
                )
                .map((f) => ({
                    found: f,
                    site: f.source,
                    values: sheetValues(f.sheet, catalog, formats),
                })),
        [found, catalog, formats, order],
    );
    // Lignes calculées à l'ouverture : la saisie derrière ne bouge pas.
    const [rows, setRows] = useState<ReturnType<typeof comparisonRows>>([]);
    const [choices, setChoices] = useState<
        Partial<Record<SheetField, SheetChoice>>
    >({});
    useEffect(() => {
        if (!found) return;
        const next = comparisonRows(current, sheets);
        setRows(next);
        setChoices(
            Object.fromEntries(
                next.map((row) => [row.field, defaultChoice(row, priority)]),
            ),
        );
        // Seule l'arrivée de nouvelles fiches compte.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [found]);

    const chooseColumn = (choice: SheetChoice) =>
        setChoices(
            Object.fromEntries(
                rows.map((row) => [
                    row.field,
                    choice === 'current' || row.found[choice]
                        ? choice
                        : (choices[row.field] ?? 'current'),
                ]),
            ),
        );

    const cell = (
        field: SheetField,
        choice: SheetChoice,
        value: string | undefined,
    ) => (
        <Table.Td key={choice} style={{ verticalAlign: 'top' }}>
            {value ? (
                <Radio
                    name={field}
                    value={choice}
                    checked={choices[field] === choice}
                    onChange={() =>
                        setChoices((current) => ({
                            ...current,
                            [field]: choice,
                        }))
                    }
                    aria-label={`${SHEET_FIELD_LABELS[field]} : ${choice === 'current' ? 'actuel' : SOURCE_LABELS[choice]}`}
                    label={<Value field={field} text={display(field, value)} />}
                />
            ) : (
                <Text size="sm" c="dimmed">
                    —
                </Text>
            )}
        </Table.Td>
    );

    return (
        <Modal
            opened={!!found}
            onClose={onClose}
            title="Comparer avec les fiches en ligne"
            size="xl"
        >
            <Stack>
                {rows.length === 0 ? (
                    <Text size="sm">
                        Les fiches n’apportent rien de nouveau : la série garde
                        ses valeurs.
                    </Text>
                ) : (
                    <Table.ScrollContainer minWidth={560}>
                        <Table verticalSpacing="xs">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th w={90} />
                                    <Table.Th>
                                        <Stack gap={2} align="flex-start">
                                            <Text size="sm" fw={600}>
                                                Actuel
                                            </Text>
                                            <Anchor
                                                component="button"
                                                size="xs"
                                                onClick={() =>
                                                    chooseColumn('current')
                                                }
                                            >
                                                Tout garder
                                            </Anchor>
                                        </Stack>
                                    </Table.Th>
                                    {sheets.map(({ site, found: f }) => (
                                        <Table.Th key={site}>
                                            <Stack gap={2} align="flex-start">
                                                <Anchor
                                                    href={f.url}
                                                    target="_blank"
                                                    size="sm"
                                                    fw={600}
                                                >
                                                    {SOURCE_LABELS[site]}
                                                </Anchor>
                                                <Anchor
                                                    component="button"
                                                    size="xs"
                                                    onClick={() =>
                                                        chooseColumn(site)
                                                    }
                                                >
                                                    Tout prendre
                                                </Anchor>
                                            </Stack>
                                        </Table.Th>
                                    ))}
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {rows.map((row) => (
                                    <Table.Tr key={row.field}>
                                        <Table.Td
                                            style={{ verticalAlign: 'top' }}
                                        >
                                            <Text size="sm" fw={500}>
                                                {SHEET_FIELD_LABELS[row.field]}
                                            </Text>
                                        </Table.Td>
                                        {cell(
                                            row.field,
                                            'current',
                                            row.current,
                                        )}
                                        {sheets.map(({ site }) =>
                                            cell(
                                                row.field,
                                                site,
                                                row.found[site],
                                            ),
                                        )}
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
                {footer}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        onClick={() => {
                            onApply(chosenValues(rows, choices));
                            onClose();
                        }}
                    >
                        Appliquer
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
