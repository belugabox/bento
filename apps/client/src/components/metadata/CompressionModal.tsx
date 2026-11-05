import {
    Alert,
    Anchor,
    Button,
    Group,
    Loader,
    Modal,
    Progress,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { formatSize } from '@/components/format';
import {
    type CompressionJob,
    estimateCompression,
    fetchCompression,
    fetchSettings,
    startCompression,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

type Estimate =
    { originalSize: number; compressedSize: number } | { error: string };

// Suivi des compressions en cours.
const POLL_MS = 2000;

const percent = (before: number, after: number) =>
    before > 0 ? Math.round(((before - after) / before) * 100) : 0;

const gain = (before: number, after: number) =>
    after < before
        ? `${formatSize(after)} (−${percent(before, after)} %)`
        : 'pas de gain';

/**
 * Compression des pages d'un ensemble de fichiers : estimation du gain,
 * puis compression en arrière-plan sur le serveur (la fenêtre peut être
 * fermée, l'avancement est repris à la réouverture).
 */
export const CompressionModal = ({
    opened,
    onClose,
    libraryId,
    files,
    onCompressed,
}: {
    opened: boolean;
    onClose: () => void;
    libraryId: number;
    files: { path: string; name: string }[];
    /** Des fichiers ont été réécrits (recharger leurs tailles). */
    onCompressed: () => void;
}) => {
    const [estimates, setEstimates] = useState<Record<string, Estimate>>({});
    const [estimating, setEstimating] = useState<number>();
    const [jobs, setJobs] = useState<CompressionJob[]>([]);
    const [error, setError] = useState<string>();
    // Réglages actuels, rappelés en tête.
    const { data: saved } = useQuery(
        () => (opened ? fetchSettings() : Promise.resolve(undefined)),
        [opened],
    );
    const settings = saved?.settings;
    const paths = files.map((f) => f.path);
    const jobOf = (path: string) =>
        jobs.find((job) => job.libraryId === libraryId && job.path === path);
    const active = files.filter((f) => {
        const state = jobOf(f.path)?.state;
        return state === 'pending' || state === 'running';
    }).length;
    const finished = files.filter((f) => {
        const state = jobOf(f.path)?.state;
        return state === 'done' || state === 'failed';
    }).length;

    // État du serveur à l'ouverture, puis tant que des tomes attendent.
    useEffect(() => {
        if (!opened) return;
        let stopped = false;
        const poll = () =>
            fetchCompression()
                .then(({ jobs }) => !stopped && setJobs(jobs))
                .catch((e: Error) => !stopped && setError(e.message));
        void poll();
        if (active === 0) return;
        const timer = setInterval(() => void poll(), POLL_MS);
        return () => {
            stopped = true;
            clearInterval(timer);
        };
    }, [opened, active]);

    // Fin des compressions lancées : prévenir le parent une fois.
    const wasActive = useRef(false);
    useEffect(() => {
        if (active > 0) wasActive.current = true;
        else if (wasActive.current) {
            wasActive.current = false;
            onCompressed();
        }
    }, [active, onCompressed]);

    const estimate = async () => {
        setError(undefined);
        const next: Record<string, Estimate> = {};
        for (const [index, path] of paths.entries()) {
            setEstimating(index);
            next[path] = await estimateCompression(libraryId, path).catch(
                (e: Error) => ({ error: e.message }),
            );
            setEstimates({ ...next });
        }
        setEstimating(undefined);
    };

    const compress = async () => {
        setError(undefined);
        try {
            setJobs((await startCompression(libraryId, paths)).jobs);
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const estimated = Object.values(estimates).filter(
        (e): e is Extract<Estimate, { originalSize: number }> =>
            'originalSize' in e,
    );
    const totalBefore = estimated.reduce((t, e) => t + e.originalSize, 0);
    const totalAfter = estimated.reduce((t, e) => t + e.compressedSize, 0);
    const done = files
        .map((f) => jobOf(f.path))
        .filter((job) => job?.state === 'done');
    const doneBefore = done.reduce((t, j) => t + (j?.originalSize ?? 0), 0);
    const doneAfter = done.reduce((t, j) => t + (j?.compressedSize ?? 0), 0);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Compresser les images"
            size="lg"
        >
            <Stack>
                <Text size="sm" c="dimmed">
                    {settings
                        ? `Pages ${
                              settings.compression.maxHeight
                                  ? `ramenées à ${settings.compression.maxHeight} px de haut au plus`
                                  : 'gardées à leur taille'
                          }, en JPEG qualité ${settings.compression.quality}`
                        : 'Pages recompressées en JPEG'}{' '}
                    (
                    <Anchor component={Link} to="/settings" size="sm">
                        réglages
                    </Anchor>
                    ). Un fichier n’est réécrit que s’il y gagne. La compression
                    continue sur le serveur si tu fermes cette fenêtre.
                </Text>
                {error && <Alert color="red">{error}</Alert>}
                {estimating !== undefined && (
                    <Progress
                        value={(estimating / Math.max(files.length, 1)) * 100}
                        animated
                    />
                )}
                {active > 0 && (
                    <Stack gap={4}>
                        <Text size="sm">
                            Compression : {finished} / {finished + active}
                        </Text>
                        <Progress
                            value={(finished / (finished + active)) * 100}
                            animated
                        />
                    </Stack>
                )}
                <Table.ScrollContainer minWidth={420} mah={360}>
                    <Table verticalSpacing={4} fz="sm">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Fichier</Table.Th>
                                <Table.Th w={110}>Estimation</Table.Th>
                                <Table.Th w={150}>Résultat</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {files.map((file) => {
                                const e = estimates[file.path];
                                const job = jobOf(file.path);
                                return (
                                    <Table.Tr key={file.path}>
                                        <Table.Td>
                                            <Text size="sm" lineClamp={1}>
                                                {file.name}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            {!e ? (
                                                '—'
                                            ) : 'error' in e ? (
                                                <Text size="xs" c="red">
                                                    {e.error}
                                                </Text>
                                            ) : (
                                                <Text size="sm">
                                                    {e.compressedSize <
                                                    e.originalSize
                                                        ? `−${percent(e.originalSize, e.compressedSize)} %`
                                                        : 'pas de gain'}
                                                </Text>
                                            )}
                                        </Table.Td>
                                        <Table.Td>
                                            {job?.state === 'pending' && (
                                                <Text size="xs" c="dimmed">
                                                    En attente
                                                </Text>
                                            )}
                                            {job?.state === 'running' && (
                                                <Loader size="xs" />
                                            )}
                                            {job?.state === 'failed' && (
                                                <Text size="xs" c="red">
                                                    {job.error}
                                                </Text>
                                            )}
                                            {job?.state === 'done' && (
                                                <Group gap={4} wrap="nowrap">
                                                    <IconCheck size={14} />
                                                    <Text size="sm">
                                                        {gain(
                                                            job.originalSize ??
                                                                0,
                                                            job.compressedSize ??
                                                                0,
                                                        )}
                                                    </Text>
                                                </Group>
                                            )}
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
                {estimated.length > 0 && (
                    <Text size="sm">
                        Estimation : {formatSize(totalBefore)} →{' '}
                        {gain(totalBefore, totalAfter)}
                    </Text>
                )}
                {done.length > 0 && (
                    <Text size="sm">
                        Compressés : {formatSize(doneBefore)} →{' '}
                        {gain(doneBefore, doneAfter)}
                    </Text>
                )}
                <Group justify="flex-end">
                    <Button
                        variant="default"
                        loading={estimating !== undefined}
                        disabled={active > 0}
                        onClick={() => void estimate()}
                    >
                        Estimer le gain
                    </Button>
                    <Button
                        disabled={
                            files.length === 0 ||
                            active > 0 ||
                            estimating !== undefined
                        }
                        onClick={() => void compress()}
                    >
                        Compresser ({files.length})
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
