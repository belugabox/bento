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
    Tabs,
    Text,
    Title,
} from '@mantine/core';
import { IconAdjustments, IconTags } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { AgesSettings } from '@/components/AgesSettings';
import { FormatsSettings } from '@/components/FormatsSettings';
import { GenresSettings } from '@/components/GenresSettings';
import { SourcePrioritySettings } from '@/components/SourcePrioritySettings';
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

/** Réglages de l'onglet « Général » (la grille d'âges est à part). */
type GeneralSettings = Pick<
    Settings,
    'compression' | 'scanIntervalMinutes' | 'appearance'
>;

const generalOf = ({
    compression,
    scanIntervalMinutes,
    appearance,
}: Settings): GeneralSettings => ({
    compression,
    scanIntervalMinutes,
    appearance,
});

/** Section de réglages : titre, explication, puis les champs. */
const Section = ({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
}) => (
    <Paper withBorder p="md" radius="md">
        <Stack gap="md">
            <div>
                <Text fw={600}>{title}</Text>
                {description && (
                    <Text size="sm" c="dimmed">
                        {description}
                    </Text>
                )}
            </div>
            {children}
        </Stack>
    </Paper>
);

/** Formulaire de l'onglet « Général », à partir des valeurs enregistrées. */
const SettingsForm = ({
    saved,
    onSaved,
}: {
    saved: SettingsResponse;
    onSaved: (saved: SettingsResponse) => void;
}) => {
    const savedGeneral = generalOf(saved.settings);
    const savedKey = JSON.stringify(savedGeneral);
    const [values, setValues] = useState<GeneralSettings>(savedGeneral);
    const [, setDefaultAppearance] = useDefaultAppearance();
    // Valeurs enregistrées changées (pas la grille d'âges) : les reprendre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => setValues(generalOf(saved.settings)), [savedKey]);
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<{ color: string; text: string }>();
    const changed = JSON.stringify(values) !== savedKey;
    const defaults = generalOf(saved.defaults);
    const isDefault = JSON.stringify(values) === JSON.stringify(defaults);

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
            <Section
                title="Compression des images"
                description="Utilisée par « Compresser… » dans l’éditeur. Les tomes déjà compressés ne changent pas."
            >
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
            </Section>

            <Section title="Scan des bibliothèques">
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
            </Section>

            <Section
                title="Apparence par défaut"
                description="Pour tous les appareils, tant que la personne n’a pas choisi la sienne (menu « Apparence »)."
            >
                <ColorSchemeControl
                    value={values.appearance.colorScheme}
                    onChange={(colorScheme) => setAppearance({ colorScheme })}
                />
                <AccentPicker
                    value={values.appearance.accent}
                    onChange={(accent) => setAppearance({ accent })}
                />
            </Section>

            {report && <Alert color={report.color}>{report.text}</Alert>}
            <Group justify="flex-end">
                <Button
                    variant="default"
                    disabled={isDefault}
                    onClick={() => setValues(defaults)}
                >
                    Valeurs par défaut
                </Button>
                <Button
                    variant="default"
                    disabled={!changed}
                    onClick={() => setValues(savedGeneral)}
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

type Tab = 'general' | 'classement';

/**
 * Réglages de Bento (admin), en deux onglets : « Général » (compression,
 * scan, apparence ; enregistrés ensemble) et « Classement » (formats, âges,
 * genres, sites des fiches en ligne ; enregistrés à chaque changement). L'onglet reste dans l'adresse.
 */
export const SettingsPage = () => {
    const { data, error } = useQuery(fetchSettings, []);
    const [saved, setSaved] = useState<SettingsResponse>();
    const [params, setParams] = useSearchParams();
    const tab: Tab =
        params.get('tab') === 'classement' ? 'classement' : 'general';
    const current = saved ?? data;

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!current) return <Loader mx="auto" />;

    return (
        <Stack maw={720}>
            <Title order={2}>Réglages</Title>
            <Tabs
                value={tab}
                onChange={(value) =>
                    setParams(value === 'classement' ? { tab: value } : {}, {
                        replace: true,
                    })
                }
                keepMounted={false}
            >
                <Tabs.List mb="md">
                    <Tabs.Tab
                        value="general"
                        leftSection={<IconAdjustments size={16} />}
                    >
                        Général
                    </Tabs.Tab>
                    <Tabs.Tab
                        value="classement"
                        leftSection={<IconTags size={16} />}
                    >
                        Classement
                    </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="general">
                    <SettingsForm saved={current} onSaved={setSaved} />
                </Tabs.Panel>
                <Tabs.Panel value="classement">
                    <Stack>
                        <FormatsSettings />
                        <AgesSettings
                            ages={current.settings.ages}
                            onSaved={setSaved}
                        />
                        <GenresSettings />
                        <SourcePrioritySettings
                            priority={current.settings.sourcePriority}
                            onSaved={setSaved}
                        />
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};
