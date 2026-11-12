import {
    Alert,
    Button,
    Group,
    Image,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconPhotoSearch } from '@tabler/icons-react';
import { useState } from 'react';

import {
    fetchBannerChoices,
    removeSeriesBanner,
    seriesBannerUrl,
    setSeriesBanner,
} from '@/services/api';

type Choices = Awaited<ReturnType<typeof fetchBannerChoices>>;

const SITE_LABELS = { 'manga-news': 'Manga-news', anilist: 'AniList' };

/**
 * Bannière d'une série (admin) : la grande illustration en tête de sa fiche,
 * choisie parmi celles de Manga-news (fiche liée) et d'AniList, cherchées à
 * la demande. Sans bannière, la fiche prend la couleur de sa couverture.
 */
export const BannerSettings = ({
    series,
    onChanged,
}: {
    series: { id: number; bannerUpdatedAt: string | null };
    onChanged: () => void;
}) => {
    const [choices, setChoices] = useState<Choices>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const current = seriesBannerUrl(series);

    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        setError(undefined);
        try {
            await action();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    const search = () =>
        run(async () => setChoices(await fetchBannerChoices(series.id)));
    const choose = (url: string) =>
        run(async () => {
            await setSeriesBanner(series.id, url);
            setChoices(undefined);
            onChanged();
        });
    const remove = () =>
        run(async () => {
            await removeSeriesBanner(series.id);
            onChanged();
        });

    return (
        <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
                <div>
                    <Text fw={600}>Bannière</Text>
                    <Text size="sm" c="dimmed">
                        Grande illustration en tête de la fiche. Sans bannière,
                        la fiche prend la couleur de la couverture.
                    </Text>
                </div>
                {current && (
                    <Image
                        src={current}
                        alt="Bannière actuelle"
                        radius="sm"
                        h={120}
                        fit="cover"
                    />
                )}
                <Group gap="xs">
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<IconPhotoSearch size={14} />}
                        loading={busy && !choices}
                        onClick={() => void search()}
                    >
                        Chercher une bannière
                    </Button>
                    {current && (
                        <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            disabled={busy}
                            onClick={() => void remove()}
                        >
                            Retirer
                        </Button>
                    )}
                </Group>
                {choices && choices.banners.length === 0 && (
                    <Text size="sm" c="dimmed">
                        Aucune bannière trouvée (Manga-news, AniList).
                    </Text>
                )}
                {choices && choices.banners.length > 0 && (
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                        {choices.banners.map((banner) => (
                            <UnstyledButton
                                key={banner.url}
                                disabled={busy}
                                onClick={() => void choose(banner.url)}
                                aria-label={`Choisir la bannière ${SITE_LABELS[banner.site]} : ${banner.title}`}
                            >
                                <Image
                                    src={banner.url}
                                    alt=""
                                    radius="sm"
                                    h={90}
                                    fit="cover"
                                />
                                <Text size="xs" c="dimmed" mt={2}>
                                    {SITE_LABELS[banner.site]} · {banner.title}
                                </Text>
                            </UnstyledButton>
                        ))}
                    </SimpleGrid>
                )}
                {[...(choices?.errors ?? []), ...(error ? [error] : [])].map(
                    (message) => (
                        <Alert key={message} color="orange" p="xs">
                            {message}
                        </Alert>
                    ),
                )}
            </Stack>
        </Paper>
    );
};
