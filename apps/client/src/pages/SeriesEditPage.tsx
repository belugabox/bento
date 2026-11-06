import { Alert, Anchor, Group, Loader, Stack, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link, useNavigate, useParams } from 'react-router';

import { CoverPicker } from '@/components/metadata/CoverPicker';
import { MetadataEditor } from '@/components/metadata/MetadataEditor';
import { volumeLabel } from '@/components/readingStatus';
import {
    coverUrl,
    fetchSeries,
    fetchVolume,
    pageUrl,
    seriesCoverUrl,
    setSeriesClassification,
    setSeriesCover,
    setSeriesReadingMode,
    setSeriesStatus,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Métadonnées et couverture d'une série publiée (admin). */
export const SeriesEditPage = () => {
    const seriesId = Number(useParams().id);
    const navigate = useNavigate();
    const {
        data: series,
        error,
        reload,
    } = useQuery(() => fetchSeries(seriesId), [seriesId]);
    const [coverOpened, cover] = useDisclosure(false);

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!series) return <Loader mx="auto" />;

    const first = series.volumes[0];
    const currentCover = first
        ? seriesCoverUrl({
              ...series,
              coverVolumeId: first.id,
              coverVolumeVersion: first.version,
          })
        : undefined;

    /** Fichiers renommés : la série peut avoir changé (nouveau dossier). */
    const afterChange = async (moved?: { from: string; to: string }[]) => {
        if (moved?.length && first) {
            const volume = await fetchVolume(first.id).catch(() => undefined);
            if (volume && volume.seriesId !== seriesId) {
                navigate(`/series/${volume.seriesId}/edit`, { replace: true });
                return;
            }
        }
        reload();
    };

    return (
        <Stack>
            <Anchor component={Link} to={`/series/${seriesId}`} size="sm">
                <Group gap={4}>
                    <IconArrowLeft size={14} /> {series.name}
                </Group>
            </Anchor>
            <Title order={2}>Modifier la série</Title>

            <MetadataEditor
                libraryId={series.library.id}
                kind={series.library.type}
                mode="series"
                status={{
                    value: series.status,
                    save: (status) => setSeriesStatus(series.id, status),
                }}
                classification={{
                    formatId: series.formatId,
                    age: series.age,
                    save: (changes) =>
                        setSeriesClassification(series.id, changes),
                }}
                cover={{ src: currentCover, onEdit: cover.open }}
                readingMode={{
                    value: series.readingMode,
                    defaultMode: series.defaultReadingMode,
                    save: (mode) => setSeriesReadingMode(series.id, mode),
                }}
                volumes={series.volumes.flatMap((volume) =>
                    volume.admin
                        ? [
                              {
                                  path: volume.admin.file,
                                  name: volume.admin.file.split('/').pop()!,
                                  comicInfo: volume.admin.comicInfo,
                                  cover: coverUrl(volume.id, volume.version),
                                  pageCount: volume.pageCount,
                              },
                          ]
                        : [],
                )}
                onChanged={(moved) => void afterChange(moved)}
            />

            <CoverPicker
                opened={coverOpened}
                onClose={cover.close}
                seriesName={series.name}
                kind={series.library.type}
                current={currentCover}
                volumes={series.volumes.map((v) => ({
                    key: String(v.id),
                    label: volumeLabel(v),
                    pageCount: v.pageCount,
                    cover: coverUrl(v.id, v.version),
                    page: (index) => pageUrl(v.id, v.version, index),
                    source: (page) => ({
                        type: 'volume',
                        volumeId: v.id,
                        page,
                    }),
                }))}
                save={(source) => setSeriesCover(series.id, source)}
                onChanged={reload}
            />
        </Stack>
    );
};
