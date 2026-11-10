import {
    Anchor,
    Button,
    Group,
    Modal,
    Paper,
    Radio,
    Stack,
    Text,
} from '@mantine/core';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import {
    type GenreEntry,
    type MetadataSource,
    SHEET_FIELD_LABELS,
    SOURCE_LABELS,
    type SheetField,
    type SourcePriority,
} from '@server/types';

import type { KnownNames } from './credits';
import {
    type SheetChoice,
    type SheetValues,
    chosenValues,
    comparisonRows,
    defaultChoice,
    rowOptions,
    sheetValues,
} from './editing';
import type { FoundSeries } from './onlineSheets';

/** Une valeur : un long résumé n'est montré qu'en partie (« voir tout »). */
const Value = ({
    field,
    text,
    expanded,
}: {
    field: SheetField;
    text: string;
    expanded: boolean;
}) => (
    <Text
        size="sm"
        lineClamp={field === 'Summary' && !expanded ? 3 : undefined}
        style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}
    >
        {text}
    </Text>
);

/** Qui donne une valeur : « Actuel · Bedetheque ». */
const sourcesLabel = (sources: SheetChoice[]) =>
    sources
        .map((source) =>
            source === 'current' ? 'Actuel' : SOURCE_LABELS[source],
        )
        .join(' · ');

/**
 * Valeurs actuelles et celles des fiches trouvées, champ par champ, en
 * cartes : pour chacun, on garde l'actuelle ou on prend celle d'une fiche.
 * Une même valeur (majuscules, accents mis à part) n'est montrée qu'une
 * fois, avec ceux qui la donnent. Seuls les champs où une fiche apporte du
 * nouveau sont montrés.
 */
export const SheetComparison = ({
    found,
    onClose,
    current,
    catalog,
    formats,
    known,
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
    /** Noms déjà connus : ceux des fiches en reprennent l'écriture. */
    known: KnownNames;
    /** Ordre des sites, le plus utile d'abord. */
    order: MetadataSource[];
    /** Site préféré pour chaque champ (choix de départ d'un champ vide). */
    priority: SourcePriority;
    /** Texte montré pour une valeur (nom du format, libellé de l'âge…). */
    display: (field: SheetField, value: string) => string;
    footer?: ReactNode;
    onApply: (values: SheetValues) => void;
}) => {
    // Listes recréées à chaque rendu par l'éditeur : elles comptent par leur
    // contenu (de même pour l'ordre des sites).
    const catalogKey = JSON.stringify(catalog);
    const formatsKey = JSON.stringify(formats);
    const sheets = useMemo(
        () =>
            [...(found ?? [])]
                .sort(
                    (a, b) => order.indexOf(a.source) - order.indexOf(b.source),
                )
                .map((f) => ({
                    found: f,
                    site: f.source,
                    values: sheetValues(f.sheet, catalog, formats, known),
                })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [found, catalogKey, formatsKey, known, order.join()],
    );
    // Lignes calculées à l'arrivée des fiches, et refaites si genres, formats,
    // noms connus ou priorités arrivent après : les choix déjà faits restent.
    const [rows, setRows] = useState<ReturnType<typeof comparisonRows>>([]);
    const [choices, setChoices] = useState<
        Partial<Record<SheetField, SheetChoice>>
    >({});
    const shown = useRef<FoundSeries[]>(undefined);
    useEffect(() => {
        if (!found) return;
        const fresh = shown.current !== found;
        shown.current = found;
        const next = comparisonRows(current, sheets);
        setRows(next);
        setChoices((previous) =>
            Object.fromEntries(
                next.map((row) => {
                    const kept = fresh ? undefined : previous[row.field];
                    const usable =
                        kept === 'current' ||
                        (kept !== undefined && !!row.found[kept]);
                    return [
                        row.field,
                        usable ? kept : defaultChoice(row, priority),
                    ];
                }),
            ),
        );
        // La saisie derrière la fenêtre ne bouge pas : `current` n'est lu
        // qu'avec de nouvelles fiches ou des listes complétées.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sheets, priority]);

    // Résumés dépliés (« voir tout »).
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const choose = (field: SheetField, choice: SheetChoice) =>
        setChoices((current) => ({ ...current, [field]: choice }));

    return (
        <Modal
            opened={!!found}
            onClose={onClose}
            title="Comparer avec les fiches en ligne"
            size="lg"
        >
            <Stack>
                {sheets.length > 0 && (
                    <Text size="xs" c="dimmed">
                        Fiches :{' '}
                        {sheets.map(({ site, found: f }, index) => (
                            <span key={site}>
                                {index > 0 && ' · '}
                                <Anchor href={f.url} target="_blank" size="xs">
                                    {SOURCE_LABELS[site]}
                                </Anchor>
                            </span>
                        ))}
                    </Text>
                )}
                {rows.length === 0 ? (
                    <Text size="sm">
                        Les fiches n’apportent rien de nouveau : la série garde
                        ses valeurs.
                    </Text>
                ) : (
                    // Une carte par champ, ses valeurs empilées : lisible sur
                    // un téléphone comme sur un grand écran.
                    <Stack gap="sm">
                        {rows.map((row) => {
                            const options = rowOptions(row, order);
                            const chosen = choices[row.field];
                            return (
                                <Paper
                                    key={row.field}
                                    withBorder
                                    p="sm"
                                    radius="md"
                                    component="fieldset"
                                    aria-label={SHEET_FIELD_LABELS[row.field]}
                                    style={{ margin: 0 }}
                                >
                                    <Stack gap="xs">
                                        <Text size="sm" fw={600}>
                                            {SHEET_FIELD_LABELS[row.field]}
                                        </Text>
                                        {options.map((option) => {
                                            const key = `${row.field}:${option.choice}`;
                                            return (
                                                <Stack key={key} gap={2}>
                                                    <Radio
                                                        name={row.field}
                                                        value={option.choice}
                                                        checked={
                                                            chosen !==
                                                                undefined &&
                                                            option.sources.includes(
                                                                chosen,
                                                            )
                                                        }
                                                        onChange={() =>
                                                            choose(
                                                                row.field,
                                                                option.choice,
                                                            )
                                                        }
                                                        aria-label={`${SHEET_FIELD_LABELS[row.field]} : ${sourcesLabel(option.sources)}`}
                                                        label={
                                                            <Stack gap={2}>
                                                                <Value
                                                                    field={
                                                                        row.field
                                                                    }
                                                                    text={display(
                                                                        row.field,
                                                                        option.value,
                                                                    )}
                                                                    expanded={
                                                                        !!expanded[
                                                                            key
                                                                        ]
                                                                    }
                                                                />
                                                                <Text
                                                                    size="xs"
                                                                    c="dimmed"
                                                                >
                                                                    {sourcesLabel(
                                                                        option.sources,
                                                                    )}
                                                                </Text>
                                                            </Stack>
                                                        }
                                                    />
                                                    {row.field === 'Summary' &&
                                                        option.value.length >
                                                            200 && (
                                                            <Anchor
                                                                component="button"
                                                                type="button"
                                                                size="xs"
                                                                ml={32}
                                                                style={{
                                                                    alignSelf:
                                                                        'flex-start',
                                                                }}
                                                                onClick={() =>
                                                                    setExpanded(
                                                                        (
                                                                            current,
                                                                        ) => ({
                                                                            ...current,
                                                                            [key]: !current[
                                                                                key
                                                                            ],
                                                                        }),
                                                                    )
                                                                }
                                                            >
                                                                {expanded[key]
                                                                    ? 'Réduire'
                                                                    : 'Voir tout'}
                                                            </Anchor>
                                                        )}
                                                </Stack>
                                            );
                                        })}
                                    </Stack>
                                </Paper>
                            );
                        })}
                    </Stack>
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
