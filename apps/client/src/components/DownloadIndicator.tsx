import { ActionIcon, RingProgress, Tooltip } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { Link } from 'react-router';

import { jobsProgress, useDownloads } from '@/offline/downloads';

/** Petit anneau d'avancement (carte d'un tome en téléchargement). */
export const DownloadRing = ({
    ratio,
    size = 26,
}: {
    ratio: number;
    size?: number;
}) => (
    <RingProgress
        size={size}
        thickness={3}
        roundCaps
        sections={[{ value: Math.max(ratio * 100, 4), color: 'blue' }]}
        aria-label={`Téléchargement : ${Math.round(ratio * 100)} %`}
        styles={{
            root: {
                background: 'var(--mantine-color-body)',
                borderRadius: '50%',
            },
        }}
    />
);

/**
 * En-tête : téléchargements en cours sur l'appareil, en anneau autour de
 * l'icône ; mène à la page « Téléchargements ». Rien sans téléchargement.
 */
export const DownloadIndicator = () => {
    const { jobs } = useDownloads();
    const progress = jobsProgress(jobs);
    if (!progress) return null;
    const percent = Math.round(progress.ratio * 100);
    return (
        <Tooltip
            label={`Téléchargement : ${progress.count} tome${progress.count > 1 ? 's' : ''}, ${percent} %`}
        >
            <ActionIcon
                component={Link}
                to="/downloads"
                variant="subtle"
                color="gray"
                size="lg"
                aria-label={`Téléchargements en cours : ${percent} %`}
            >
                <RingProgress
                    size={34}
                    thickness={3}
                    roundCaps
                    sections={[{ value: Math.max(percent, 4), color: 'blue' }]}
                    label={
                        <IconDownload
                            size={16}
                            style={{ display: 'block', margin: 'auto' }}
                        />
                    }
                />
            </ActionIcon>
        </Tooltip>
    );
};
