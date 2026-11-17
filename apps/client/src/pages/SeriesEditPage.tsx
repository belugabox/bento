import { Alert, Menu, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowBackUp, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { PageLoader } from '@/components/PageLoader';
import {
    type SeriesFileAction,
    SeriesFileModal,
} from '@/components/SeriesFileModal';
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
    // Remettre en brouillon, supprimer : confirmation ouverte du menu « ⋯ ».
    const [fileAction, setFileAction] = useState<SeriesFileAction>();
    // Depuis la page Séries : sa liste (ordre, filtres), pour passer à la
    // suivante et y revenir.
    const fromManage = params.get('from') === 'manage';
    const queue = fromManage ? readManageQueue() : null;

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!series) return <PageLoader />;

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
            {/* Ouverte depuis la page Séries : retour à sa liste (même
                onglet, même tri), et la place dans la liste. */}
            <PageHeader
                back={
                    fromManage
                        ? `/manage${queue?.search ? `?${queue.search}` : ''}`
                        : `/series/${seriesId}`
                }
                backLabel={
                    fromManage ? 'Retour aux séries' : 'Retour à la série'
                }
                title="Modifier la série"
                description={series.name}
            >
                {fromManage && place?.position && (
                    <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                        {place.position} / {place.total}
                    </Text>
                )}
            </PageHeader>

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
                    startYear: series.startYear,
                    endYear: series.endYear,
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
                menu={
                    <>
                        <Menu.Item
                            leftSection={<IconArrowBackUp size={16} />}
                            onClick={() => setFileAction('draft')}
                        >
                            Remettre en brouillon
                        </Menu.Item>
                        <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={16} />}
                            onClick={() => setFileAction('delete')}
                        >
                            Supprimer du disque
                        </Menu.Item>
                    </>
                }
            />

            <SeriesFileModal
                action={fileAction}
                onClose={() => setFileAction(undefined)}
                seriesId={series.id}
                name={series.name}
                volumeCount={series.volumes.length}
                size={series.volumes.reduce((sum, v) => sum + (v.size ?? 0), 0)}
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
