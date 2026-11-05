import {
    Alert,
    Anchor,
    Button,
    Group,
    Image,
    Loader,
    Stack,
    Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowLeft, IconPhoto } from '@tabler/icons-react';
import { Link, useNavigate, useParams } from 'react-router';

import { CoverPicker } from '@/components/metadata/CoverPicker';
import { MetadataEditor } from '@/components/metadata/MetadataEditor';
import { volumeLabel } from '@/components/readingStatus';
import {
    coverUrl,
    fetchSeries,
    fetchVolume,
    seriesCoverUrl,
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
            <Group justify="space-between" align="flex-start">
                <Title order={2}>Modifier la série</Title>
                <Group align="flex-end">
                    {first && (
                        <Image
                            src={seriesCoverUrl({
                                ...series,
                                coverVolumeId: first.id,
                            })}
                            w={64}
                            h={96}
                            fit="cover"
                            radius="sm"
                            alt=""
                        />
                    )}
                    <Button
                        variant="default"
                        leftSection={<IconPhoto size={16} />}
                        onClick={cover.open}
                    >
                        Couverture…
                    </Button>
                </Group>
            </Group>

            <MetadataEditor
                libraryId={series.library.id}
                kind={series.library.type}
                mode="series"
                status={{
                    value: series.status,
                    save: (status) => setSeriesStatus(series.id, status),
                }}
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
                                  cover: coverUrl(volume.id),
                              },
                          ]
                        : [],
                )}
                onChanged={(moved) => void afterChange(moved)}
            />

            <CoverPicker
                opened={coverOpened}
                onClose={cover.close}
                seriesId={series.id}
                seriesName={series.name}
                kind={series.library.type}
                volumes={series.volumes.map((v) => ({
                    id: v.id,
                    label: volumeLabel(v),
                    pageCount: v.pageCount,
                }))}
                onChanged={reload}
            />
        </Stack>
    );
};
