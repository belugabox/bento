import { useEffect, useSyncExternalStore } from 'react';

import {
    coverUrl,
    fetchPageSizes,
    fetchVolume,
    pageUrl,
    screenPageWidth,
} from '@/services/api';

/**
 * Tomes téléchargés sur l'appareil, pour les lire sans réseau. Pages et
 * couverture vont dans le cache `bento-downloads` du navigateur, à leur
 * adresse habituelle : le service worker les y trouve (`sw/sw.js`). Chaque
 * tome y a aussi sa fiche (`/__offline__/volumes/<id>`) : ce que le lecteur
 * demande d'habitude au serveur.
 */
export const DOWNLOADS_CACHE = 'bento-downloads';
const META_PREFIX = '/__offline__/volumes/';
// Pages téléchargées en même temps.
const PARALLEL = 3;

type Volume = Awaited<ReturnType<typeof fetchVolume>>;

/** Lecture sur l'appareil : page atteinte, tome fini, et quand. */
export type LocalProgress = { page: number; completed: boolean; at: number };

export type DownloadedVolume = Omit<Volume, 'progress'> & {
    /** Compte qui l'a téléchargé : effacé si un autre se connecte. */
    userId: number;
    /** Progression du serveur au téléchargement. */
    progress: Volume['progress'];
    /** Lecture faite sur l'appareil depuis (la plus récente gagne). */
    localProgress?: LocalProgress;
    pageSizes: [number, number][];
    /** Place prise, en octets. */
    bytes: number;
    downloadedAt: number;
};

/** Avancement d'un téléchargement en cours. */
export type DownloadJob = {
    volumeId: number;
    label: string;
    done: number;
    total: number;
    state: 'waiting' | 'running' | 'failed';
    error?: string;
};

/**
 * Avancement de téléchargements (0 à 1) : les pages faites sur toutes les
 * pages connues ; un tome encore en attente compte pour zéro.
 */
export const jobsProgress = (jobs: DownloadJob[]) => {
    const active = jobs.filter((j) => j.state !== 'failed');
    if (active.length === 0) return undefined;
    const ratio =
        active.reduce((t, j) => t + (j.total ? j.done / j.total : 0), 0) /
        active.length;
    return { count: active.length, ratio };
};

const supported = () => typeof caches !== 'undefined';
const metaUrl = (volumeId: number) => `${META_PREFIX}${volumeId}`;

// --- État partagé (liste des tomes téléchargés, téléchargements en cours).

let downloads: DownloadedVolume[] = [];
let loaded = false;
let jobs: DownloadJob[] = [];
let snapshot = { downloads, jobs };
const listeners = new Set<() => void>();
const changed = () => {
    snapshot = { downloads, jobs };
    for (const listener of listeners) listener();
};

const readAll = async (): Promise<DownloadedVolume[]> => {
    if (!supported()) return [];
    const cache = await caches.open(DOWNLOADS_CACHE);
    const keys = await cache.keys();
    const metas = await Promise.all(
        keys
            .filter((request) =>
                new URL(request.url).pathname.startsWith(META_PREFIX),
            )
            .map(
                async (request) =>
                    (
                        await cache.match(request)
                    )?.json() as Promise<DownloadedVolume>,
            ),
    );
    return metas.filter(Boolean);
};

/** Relit la liste des tomes téléchargés. */
export const refreshDownloads = async () => {
    downloads = await readAll();
    changed();
    return downloads;
};

/** Tomes téléchargés et téléchargements en cours, suivis. */
export const useDownloads = () => {
    const state = useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => snapshot,
    );
    // Lue une fois (chaque carte de tome utilise ce hook).
    useEffect(() => {
        if (loaded) return;
        loaded = true;
        void refreshDownloads();
    }, []);
    return state;
};

export const getDownload = async (
    volumeId: number,
): Promise<DownloadedVolume | undefined> => {
    if (!supported()) return undefined;
    const cache = await caches.open(DOWNLOADS_CACHE);
    return (await cache.match(metaUrl(volumeId)))?.json();
};

const saveMeta = async (meta: DownloadedVolume) => {
    const cache = await caches.open(DOWNLOADS_CACHE);
    await cache.put(
        metaUrl(meta.id),
        new Response(JSON.stringify(meta), {
            headers: { 'Content-Type': 'application/json' },
        }),
    );
};

/** Garde une adresse dans le cache, et rend sa taille. */
const keep = async (cache: Cache, url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erreur ${response.status}`);
    const blob = await response.blob();
    await cache.put(
        url,
        new Response(blob, {
            headers: {
                'Content-Type':
                    response.headers.get('Content-Type') ?? blob.type,
            },
        }),
    );
    return blob.size;
};

/** Télécharge un tome : ses infos, sa couverture et ses pages. */
const download = async (volumeId: number, userId: number) => {
    const update = (changes: Partial<DownloadJob>) => {
        jobs = jobs.map((job) =>
            job.volumeId === volumeId ? { ...job, ...changes } : job,
        );
        changed();
    };
    const volume = await fetchVolume(volumeId);
    const pageSizes = await fetchPageSizes(volumeId);
    update({ state: 'running', total: volume.pageCount });
    const cache = await caches.open(DOWNLOADS_CACHE);
    const width = screenPageWidth();
    let bytes = await keep(cache, coverUrl(volume.id, volume.version, 'small'));
    let next = 0;
    let done = 0;
    const worker = async () => {
        while (next < volume.pageCount) {
            const index = next++;
            // Taille lue avant d'être ajoutée : `bytes += await …` lirait le
            // total d'avant l'attente, et perdrait celles des autres pages.
            const size = await keep(
                cache,
                pageUrl(volume.id, volume.version, index, width),
            );
            bytes += size;
            done++;
            update({ done });
        }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    await saveMeta({
        ...volume,
        userId,
        pageSizes,
        bytes,
        downloadedAt: Date.now(),
    });
};

let running = false;

/** Lance les téléchargements en attente, un tome à la fois. */
const run = async (userId: number) => {
    if (running) return;
    running = true;
    try {
        for (;;) {
            const job = jobs.find((j) => j.state === 'waiting');
            if (!job) break;
            try {
                await download(job.volumeId, userId);
                jobs = jobs.filter((j) => j.volumeId !== job.volumeId);
                await refreshDownloads();
            } catch (e) {
                // Pages déjà gardées : effacées, le tome reste à télécharger.
                await removeFiles(job.volumeId);
                jobs = jobs.map((j) =>
                    j.volumeId === job.volumeId
                        ? { ...j, state: 'failed', error: (e as Error).message }
                        : j,
                );
                changed();
            }
        }
    } finally {
        running = false;
    }
};

/**
 * Ajoute des tomes à télécharger (ceux déjà téléchargés ou en attente sont
 * ignorés). La première fois, demande au navigateur de ne pas effacer ce
 * stockage quand l'appareil manque de place.
 */
export const queueDownloads = (
    volumes: { id: number; label: string }[],
    userId: number,
) => {
    if (!supported()) throw new Error('Téléchargement impossible ici');
    const known = new Set([
        ...downloads.map((d) => d.id),
        ...jobs.filter((j) => j.state !== 'failed').map((j) => j.volumeId),
    ]);
    const added = volumes.filter((v) => !known.has(v.id));
    jobs = [
        ...jobs.filter((j) => !added.some((v) => v.id === j.volumeId)),
        ...added.map((v) => ({
            volumeId: v.id,
            label: v.label,
            done: 0,
            total: 0,
            state: 'waiting' as const,
        })),
    ];
    changed();
    void navigator.storage?.persist?.().catch(() => false);
    void run(userId);
    return added.length;
};

/** Pages, couverture et fiche d'un tome, effacées. */
const removeFiles = async (volumeId: number) => {
    const cache = await caches.open(DOWNLOADS_CACHE);
    const prefix = `/api/volumes/${volumeId}/`;
    for (const request of await cache.keys()) {
        const { pathname } = new URL(request.url);
        if (pathname.startsWith(prefix) || pathname === metaUrl(volumeId)) {
            await cache.delete(request);
        }
    }
};

/** Supprime un tome de l'appareil. */
export const deleteDownload = async (volumeId: number) => {
    if (!supported()) return;
    await removeFiles(volumeId);
    jobs = jobs.filter((j) => j.volumeId !== volumeId);
    await refreshDownloads();
};

/** Efface tout : déconnexion, ou autre compte sur l'appareil. */
export const clearDownloads = async () => {
    jobs = [];
    if (supported()) await caches.delete(DOWNLOADS_CACHE);
    await refreshDownloads();
};

/** Tomes d'un autre compte sur l'appareil : effacés (contrôle parental). */
export const keepOnlyDownloadsOf = async (userId: number) => {
    const all = await readAll();
    if (all.some((d) => d.userId !== userId)) await clearDownloads();
};

/** Lecture faite sur l'appareil, gardée dans la fiche du tome téléchargé. */
export const saveLocalProgress = async (
    volumeId: number,
    progress: { page?: number; completed?: boolean },
) => {
    const meta = await getDownload(volumeId);
    if (!meta) return;
    const current = meta.localProgress ?? {
        page: meta.progress?.page ?? 0,
        completed: meta.progress?.completed ?? false,
        at: 0,
    };
    await saveMeta({
        ...meta,
        localProgress: {
            page: progress.page ?? current.page,
            completed: progress.completed ?? current.completed,
            at: Date.now(),
        },
    });
    await refreshDownloads();
};

/**
 * Progression d'un tome téléchargé : celle de l'appareil si elle est plus
 * récente que celle du serveur au téléchargement.
 */
export const progressOf = (meta: DownloadedVolume) =>
    meta.localProgress ?? meta.progress;

/** Place prise par Bento et place libre sur l'appareil (si connues). */
export const storageEstimate = async () => {
    const estimate = await navigator.storage
        ?.estimate?.()
        .catch(() => undefined);
    return {
        used: downloads.reduce((t, d) => t + d.bytes, 0),
        available:
            estimate?.quota !== undefined && estimate.usage !== undefined
                ? estimate.quota - estimate.usage
                : undefined,
    };
};
