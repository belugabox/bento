import { useLocalStorage } from '@mantine/hooks';

import { isMainKind } from '@server/types';

import { volumeLabel } from '@/components/readingStatus';
import { fetchInProgress, fetchSeries } from '@/services/api';

import {
    type DownloadedVolume,
    deleteDownload,
    progressOf,
    queueDownloads,
    refreshDownloads,
} from './downloads';

/**
 * Téléchargements automatiques (réglage de l'appareil, page
 * « Téléchargements ») : les tomes suivants des séries en cours, et le
 * ménage des tomes lus.
 */
export type AutoSettings = {
    /** Télécharger les tomes suivants des séries en cours. */
    enabled: boolean;
    /** Tomes gardés d'avance par série (le tome en cours compris). */
    count: number;
    /** Seulement en Wi-Fi (connu sur Android). */
    wifiOnly: boolean;
    /** Effacer les tomes lus depuis plus de `CLEAN_DAYS` jours. */
    clean: boolean;
};

export const DEFAULT_AUTO: AutoSettings = {
    enabled: false,
    count: 2,
    wifiOnly: true,
    clean: true,
};

/**
 * « Le prochain tome », « Les 3 prochains tomes » : tomes à télécharger à
 * partir de celui à lire (compris). Mêmes mots sur la fiche série et dans
 * « Téléchargements ».
 */
export const nextVolumesLabel = (count: number) =>
    count === 1 ? 'Le prochain tome' : `Les ${count} prochains tomes`;

/** Nombres de tomes proposés au choix (fiche série, réglage automatique). */
export const NEXT_VOLUME_COUNTS = [1, 2, 3, 5];

const KEY = 'bento:offline';
// Séries prises en compte : les plus récemment lues.
export const AUTO_SERIES = 5;
export const CLEAN_DAYS = 30;
// Pas plus d'un passage par demi-heure.
const EVERY_MS = 30 * 60 * 1000;

export const readAutoSettings = (): AutoSettings => {
    try {
        return {
            ...DEFAULT_AUTO,
            ...(JSON.parse(
                localStorage.getItem(KEY) ?? '{}',
            ) as Partial<AutoSettings>),
        };
    } catch {
        return DEFAULT_AUTO;
    }
};

/** Réglage de l'appareil, suivi (page « Téléchargements »). */
export const useAutoSettings = () => {
    const [saved, setSaved] = useLocalStorage<Partial<AutoSettings>>({
        key: KEY,
        defaultValue: {},
        getInitialValueInEffect: false,
    });
    const settings = { ...DEFAULT_AUTO, ...saved };
    return {
        ...settings,
        set: (changes: Partial<AutoSettings>) =>
            setSaved((current) => ({ ...current, ...changes })),
    };
};

/**
 * Connexion mesurée (données mobiles) : `navigator.connection.type`, connu
 * sur Android ; ailleurs, supposée libre.
 */
const onMeteredNetwork = () => {
    const type = (navigator as { connection?: { type?: string } }).connection
        ?.type;
    return (
        type !== undefined && !['wifi', 'ethernet', 'unknown'].includes(type)
    );
};

/** Tome lu depuis plus de `CLEAN_DAYS` jours (sur l'appareil ou ailleurs). */
export const readLongAgo = (volume: DownloadedVolume, now = Date.now()) => {
    const progress = progressOf(volume);
    if (!progress?.completed) return false;
    const readAt = volume.localProgress?.at || volume.downloadedAt;
    return now - readAt > CLEAN_DAYS * 24 * 3600 * 1000;
};

/** Tome proposé au téléchargement. */
export type Proposal = {
    id: number;
    label: string;
    seriesId: number;
    seriesName: string;
    version: number;
    pageCount: number;
    /** Le tome en cours de lecture (sinon un des suivants). */
    current: boolean;
};

/**
 * Propositions : dans les séries en cours (les `AUTO_SERIES` plus récemment
 * lues), le tome en cours et les suivants, `count` par série, pas encore
 * lus ni téléchargés. Le mode automatique les télécharge.
 */
export const fetchProposals = async (count: number): Promise<Proposal[]> => {
    const downloaded = new Set((await refreshDownloads()).map((d) => d.id));
    const continuing = (await fetchInProgress()).slice(0, AUTO_SERIES);
    const proposals: Proposal[] = [];
    for (const item of continuing) {
        const series = await fetchSeries(item.seriesId);
        const main = series.volumes.filter((v) => isMainKind(v.kind));
        const from = Math.max(
            main.findIndex((v) => v.id === item.volumeId),
            0,
        );
        for (const volume of main.slice(from, from + count)) {
            if (volume.progress?.completed || downloaded.has(volume.id)) {
                continue;
            }
            proposals.push({
                id: volume.id,
                label: `${series.name}, ${volumeLabel(volume).toLowerCase()}`,
                seriesId: series.id,
                seriesName: series.name,
                version: volume.version,
                pageCount: volume.pageCount,
                current: volume.id === item.volumeId,
            });
        }
    }
    return proposals;
};

let lastRun = 0;

/**
 * Un passage : efface les tomes lus depuis longtemps, puis met en
 * téléchargement les tomes suivants des séries en cours. Au plus une fois
 * par demi-heure (`force` : tout de suite).
 */
export const runAutoDownloads = async (userId: number, force = false) => {
    const settings = readAutoSettings();
    if (!force && Date.now() - lastRun < EVERY_MS) return 0;
    lastRun = Date.now();
    const downloads = await refreshDownloads();

    if (settings.clean) {
        for (const volume of downloads.filter((v) => readLongAgo(v))) {
            await deleteDownload(volume.id);
        }
    }
    if (!settings.enabled || (settings.wifiOnly && onMeteredNetwork())) {
        return 0;
    }

    return queueDownloads(await fetchProposals(settings.count), userId);
};
