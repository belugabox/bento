import {
    Alert,
    Anchor,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { queuePosition, readManageQueue } from '@/components/manageQueue';
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
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const {
        data: series,
        error,
        reload,
    } = useQuery(() => fetchSeries(seriesId), [seriesId]);
    const [coverOpened, cover] = useDisclosure(false);
    // Depuis la page Séries : sa liste (ordre, filtres), pour passer à la
    // suivante et y revenir.
    const fromManage = params.get('from') === 'manage';
    const queue = fromManage ? readManageQueue() : null;

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

    const place = queuePosition(queue, series.id);
    const next = place?.next;

    return (
        <Stack>
            <Anchor component={Link} to={`/series/${seriesId}`} size="sm">
                <Group gap={4}>
                    <IconArrowLeft size={14} /> {series.name}
                </Group>
            </Anchor>
            <Group justify="space-between" align="baseline">
                <Title order={2}>Modifier la série</Title>
                {fromManage && (
                    <Anchor
                        component={Link}
                        to={`/manage${queue?.search ? `?${queue.search}` : ''}`}
                        size="sm"
                    >
                        <Group gap={4} wrap="nowrap">
                            <IconArrowLeft size={14} /> Séries
                            {place?.position && (
                                <Text span size="xs" c="dimmed">
                                    ({place.position} / {place.total})
                                </Text>
                            )}
                        </Group>
                    </Anchor>
                )}
            </Group>

            <MetadataEditor
                // Une autre série (« Suivante ») : un éditeur tout neuf.
                key={series.id}
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
                    sources: series.sources,
                    rating: series.rating,
                    save: (changes) =>
                        setSeriesClassification(series.id, changes),
                }}
                cover={{ src: currentCover, onEdit: cover.open }}
                // « Remplir » depuis la page Séries : recherche en ligne lancée.
                autoFill={params.get('fill') === 'online'}
                next={
                    next && {
                        name: next.name,
                        go: () =>
                            navigate(
                                `/series/${next.id}/edit?${params.toString()}`,
                            ),
                    }
                }
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
                                  size: volume.size,
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
