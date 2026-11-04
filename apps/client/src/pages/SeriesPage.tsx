import {
    Alert,
    Anchor,
    Badge,
    Button,
    Flex,
    Group,
    Image,
    Loader,
    SimpleGrid,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconArrowLeft, IconPlayerPlay } from '@tabler/icons-react';
import { Link, useParams } from 'react-router';

import { CoverCard } from '@/components/CoverCard';
import { coverUrl, fetchSeries } from '@/services/api';
import { useQuery } from '@/services/useQuery';

const volumeLabel = (volume: {
    number: string | null;
    title: string | null;
}) =>
    volume.number ? `Tome ${volume.number}` : (volume.title ?? 'Hors-série');

/** Fiche d'une série : informations et tomes. */
export const SeriesPage = () => {
    const seriesId = Number(useParams().id);
    const { data: series, error } = useQuery(
        () => fetchSeries(seriesId),
        [seriesId],
    );

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!series) return <Loader mx="auto" />;

    const first = series.volumes[0];
    const details = [
        series.year && String(series.year),
        series.writer,
        series.publisher,
    ].filter(Boolean);

    return (
        <Stack>
            <Anchor component={Link} to="/" size="sm">
                <Group gap={4}>
                    <IconArrowLeft size={14} /> {series.library.name}
                </Group>
            </Anchor>

            <Flex gap="lg" direction={{ base: 'column', xs: 'row' }}>
                {first && (
                    <Image
                        src={coverUrl(first.id)}
                        alt={series.name}
                        w={{ base: 160, sm: 200 }}
                        radius="md"
                        style={{ flexShrink: 0, alignSelf: 'flex-start' }}
                    />
                )}
                <Stack gap="xs">
                    <Title order={2}>{series.name}</Title>
                    {details.length > 0 && (
                        <Text c="dimmed" size="sm">
                            {details.join(' · ')}
                        </Text>
                    )}
                    <Group gap="xs">
                        <Badge variant="light">
                            {series.volumes.length}
                            {series.count ? ` / ${series.count}` : ''} tome
                            {series.volumes.length > 1 ? 's' : ''}
                        </Badge>
                        {series.genre && (
                            <Badge variant="light" color="gray">
                                {series.genre}
                            </Badge>
                        )}
                        {series.ageRating && series.ageRating !== 'Unknown' && (
                            <Badge variant="light" color="orange">
                                {series.ageRating}
                            </Badge>
                        )}
                    </Group>
                    {series.summary && (
                        <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                            {series.summary}
                        </Text>
                    )}
                    {first && (
                        <Button
                            component={Link}
                            to={`/read/${first.id}`}
                            leftSection={<IconPlayerPlay size={16} />}
                            w="fit-content"
                        >
                            Lire {volumeLabel(first).toLowerCase()}
                        </Button>
                    )}
                </Stack>
            </Flex>

            <SimpleGrid cols={{ base: 3, xs: 4, sm: 5, md: 6, lg: 8 }}>
                {series.volumes.map((volume) => (
                    <CoverCard
                        key={volume.id}
                        to={`/read/${volume.id}`}
                        coverId={volume.id}
                        title={volumeLabel(volume)}
                        subtitle={`${volume.pageCount} pages`}
                    />
                ))}
            </SimpleGrid>
        </Stack>
    );
};
