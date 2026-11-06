import {
    Alert,
    Button,
    Group,
    Loader,
    NumberInput,
    Paper,
    Select,
    Slider,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useEffect, useState } from 'react';

import { GenresSettings } from '@/components/GenresSettings';
import { AccentPicker, ColorSchemeControl } from '@/components/ThemePickers';
import { useDefaultAppearance } from '@/components/theme';
import {
    type Settings,
    type SettingsResponse,
    fetchSettings,
    saveSettings,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

// Valeur du choix « Taille d'origine » (Select n'accepte pas null).
const ORIGINAL = 'original';

const HEIGHTS = [1600, 2000, 2400, 3000, 4000];

const heightOptions = (current: number | null) => [
    ...[...new Set([...HEIGHTS, ...(current ? [current] : [])])]
        .sort((a, b) => a - b)
        .map((height) => ({
            value: String(height),
            label: `${height} px`,
        })),
    { value: ORIGINAL, label: 'Taille d’origine (pas de réduction)' },
];

const QUALITY_MARKS = [
    { value: 60, label: '60' },
    { value: 75, label: '75' },
    { value: 90, label: '90' },
    { value: 95, label: '95' },
];

/** Formulaire des réglages, à partir des valeurs enregistrées. */
const SettingsForm = ({
    saved,
    onSaved,
}: {
    saved: SettingsResponse;
    onSaved: (saved: SettingsResponse) => void;
}) => {
    const [values, setValues] = useState<Settings>(saved.settings);
    const [, setDefaultAppearance] = useDefaultAppearance();
    useEffect(() => setValues(saved.settings), [saved.settings]);
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<{ color: string; text: string }>();
    const changed = JSON.stringify(values) !== JSON.stringify(saved.settings);
    const isDefault = JSON.stringify(values) === JSON.stringify(saved.defaults);

    const setCompression = (changes: Partial<Settings['compression']>) =>
        setValues((current) => ({
            ...current,
            compression: { ...current.compression, ...changes },
        }));

    const setAppearance = (changes: Partial<Settings['appearance']>) =>
        setValues((current) => ({
            ...current,
            appearance: { ...current.appearance, ...changes },
        }));

    const save = async () => {
        setBusy(true);
        setReport(undefined);
        try {
            const result = await saveSettings(values);
            onSaved(result);
            // Appliqué tout de suite aux appareils sans thème à eux.
            setDefaultAppearance(result.settings.appearance);
            setReport({ color: 'green', text: 'Réglages enregistrés.' });
        } catch (e) {
            setReport({ color: 'red', text: (e as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Stack>
            <Paper withBorder p="md" radius="md">
                <Stack gap="md">
                    <div>
                        <Text fw={600}>Compression des images</Text>
                        <Text size="sm" c="dimmed">
                            Utilisée par « Compresser… » dans l’éditeur. Les
                            tomes déjà compressés ne changent pas.
                        </Text>
                    </div>
                    <Stack gap={4}>
                        <Text size="sm" fw={500}>
                            Qualité JPEG : {values.compression.quality}
                        </Text>
                        <Slider
                            min={50}
                            max={100}
                            step={1}
                            marks={QUALITY_MARKS}
                            value={values.compression.quality}
                            onChange={(quality) => setCompression({ quality })}
                            aria-label="Qualité JPEG"
                            mb="lg"
                        />
                        <Text size="xs" c="dimmed">
                            Plus bas : fichiers plus légers, mais des défauts
                            visibles sur les trames et les dégradés. 80 à 90
                            convient à la plupart des mangas.
                        </Text>
                    </Stack>
                    <Select
                        label="Hauteur maximale des pages"
                        description="Les pages plus hautes sont réduites ; 2400 px reste net sur une tablette."
                        allowDeselect={false}
                        value={
                            values.compression.maxHeight === null
                                ? ORIGINAL
                                : String(values.compression.maxHeight)
                        }
                        onChange={(value) =>
                            setCompression({
                                maxHeight:
                                    value === ORIGINAL || value === null
                                        ? null
                                        : Number(value),
                            })
                        }
                        data={heightOptions(values.compression.maxHeight)}
                    />
                </Stack>
            </Paper>

            <Paper withBorder p="md" radius="md">
                <Stack gap="md">
                    <Text fw={600}>Scan des bibliothèques</Text>
                    <NumberInput
                        label="Scan automatique toutes les (minutes)"
                        description="0 : jamais (le scan reste possible depuis les statistiques, et après chaque publication)."
                        min={0}
                        max={7 * 24 * 60}
                        value={values.scanIntervalMinutes}
                        onChange={(value) =>
                            setValues((current) => ({
                                ...current,
                                scanIntervalMinutes: Number(value) || 0,
                            }))
                        }
                    />
                </Stack>
            </Paper>

            <Paper withBorder p="md" radius="md">
                <Stack gap="md">
                    <div>
                        <Text fw={600}>Apparence par défaut</Text>
                        <Text size="sm" c="dimmed">
                            Pour tous les appareils, tant que la personne n’a
                            pas choisi la sienne (menu « Apparence »).
                        </Text>
                    </div>
                    <ColorSchemeControl
                        value={values.appearance.colorScheme}
                        onChange={(colorScheme) =>
                            setAppearance({ colorScheme })
                        }
                    />
                    <AccentPicker
                        value={values.appearance.accent}
                        onChange={(accent) => setAppearance({ accent })}
                    />
                </Stack>
            </Paper>

            {report && <Alert color={report.color}>{report.text}</Alert>}
            <Group justify="flex-end">
                <Button
                    variant="default"
                    disabled={isDefault}
                    onClick={() => setValues(saved.defaults)}
                >
                    Valeurs par défaut
                </Button>
                <Button
                    variant="default"
                    disabled={!changed}
                    onClick={() => setValues(saved.settings)}
                >
                    Annuler
                </Button>
                <Button
                    disabled={!changed}
                    loading={busy}
                    onClick={() => void save()}
                >
                    Enregistrer
                </Button>
            </Group>
        </Stack>
    );
};

/** Réglages de Bento (admin). */
export const SettingsPage = () => {
    const { data, error } = useQuery(fetchSettings, []);
    const [saved, setSaved] = useState<SettingsResponse>();
    const current = saved ?? data;

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!current) return <Loader mx="auto" />;

    return (
        <Stack maw={640}>
            <Title order={2}>Réglages</Title>
            <SettingsForm saved={current} onSaved={setSaved} />
            <GenresSettings />
        </Stack>
    );
};
