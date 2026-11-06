import {
    Alert,
    Anchor,
    Button,
    Divider,
    Group,
    Image,
    Loader,
    Modal,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

import {
    type MangaNewsDetails,
    type WikipediaDetails,
    fetchMangaNewsSeries,
    fetchWikipediaSeries,
    searchMangaNews,
    searchWikipedia,
} from '@/services/api';

import {
    type SeriesSheet,
    sheetFromMangaNews,
    sheetFromWikipedia,
} from './editing';

export type MetadataSource = 'manga-news' | 'wikipedia';

const SOURCES: { value: MetadataSource; label: string }[] = [
    { value: 'manga-news', label: 'Manga-news' },
    { value: 'wikipedia', label: 'Wikipédia' },
];

/** Série choisie : sa fiche, son image et d'où elle vient. */
export type FoundSeries = {
    source: MetadataSource;
    title: string;
    url: string;
    coverUrl?: string;
    sheet: SeriesSheet;
};

type Result = { key: string; title: string; subtitle?: string };

/** Ce que montre l'aperçu d'une fiche, ligne par ligne. */
type Preview = FoundSeries & { lines: string[]; themes?: string[] };

const fromWikipedia = (details: WikipediaDetails): Preview => ({
    source: 'wikipedia',
    title: details.title,
    url: details.url,
    coverUrl: details.coverUrl,
    sheet: sheetFromWikipedia(details),
    lines: [
        details.genre,
        details.writer,
        details.publisher,
        details.firstYear
            ? details.lastYear
                ? `${details.firstYear} – ${details.lastYear}`
                : `depuis ${details.firstYear}`
            : '',
        details.volumeCount ? `${details.volumeCount} tomes` : '',
    ].filter(Boolean),
});

const fromMangaNews = (details: MangaNewsDetails): Preview => ({
    source: 'manga-news',
    title: details.title,
    url: details.url,
    coverUrl: details.coverUrl,
    sheet: sheetFromMangaNews(details),
    themes: details.themes,
    lines: [
        [details.format, details.year].filter(Boolean).join(' · '),
        details.genres.join(', '),
        details.writer,
        details.publisher,
        details.volumeCount
            ? `${details.volumeCount} tomes en VF${details.ongoing === undefined ? '' : details.ongoing ? ' (en cours)' : ' (terminée)'}`
            : '',
        details.age !== undefined
            ? `Âge conseillé : ${details.age === 0 ? 'tout public' : `${details.age}+`}`
            : '',
    ].filter(Boolean),
});

const SOURCE_LABELS: Record<MetadataSource, string> = {
    'manga-news': 'Manga-news',
    wikipedia: 'Wikipédia',
};

/**
 * Recherche d'une série en ligne, sur Manga-news (mangas) ou Wikipédia FR :
 * résultats, aperçu de la fiche, puis « Utiliser » renvoie la fiche choisie.
 */
export const SeriesSearch = ({
    opened,
    onClose,
    kind,
    initialQuery,
    actionLabel = 'Utiliser cette fiche',
    onPick,
    footer,
    autoSearch = false,
}: {
    opened: boolean;
    onClose: () => void;
    kind: 'manga' | 'comics';
    initialQuery: string;
    actionLabel?: string;
    onPick: (found: FoundSeries) => void;
    /** Options et actions en bas de la fenêtre. */
    footer?: ReactNode;
    /** Lancer la recherche dès l'ouverture (série à classer). */
    autoSearch?: boolean;
}) => {
    // Manga-news ne connaît que les mangas (et manhwas…).
    const defaultSource: MetadataSource =
        kind === 'manga' ? 'manga-news' : 'wikipedia';
    const [source, setSource] = useState<MetadataSource>(defaultSource);
    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<Result[]>();
    const [preview, setPreview] = useState<Preview>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();

    // Nouvelle ouverture : repartir de la série en cours d'édition.
    useEffect(() => {
        if (!opened) return;
        setSource(defaultSource);
        setQuery(initialQuery);
        setResults(undefined);
        setPreview(undefined);
        setError(undefined);
        if (autoSearch) void searchIn(defaultSource, initialQuery);
        // `searchIn` change à chaque rendu : seule l'ouverture compte.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, initialQuery, defaultSource, autoSearch]);

    const run = async <T,>(task: () => Promise<T>) => {
        setLoading(true);
        setError(undefined);
        try {
            return await task();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const searchIn = async (from: MetadataSource, wanted = query) => {
        const text = wanted.trim();
        if (!text) return;
        setPreview(undefined);
        setResults(
            await run(async () =>
                from === 'wikipedia'
                    ? (await searchWikipedia(text, kind)).map((r) => ({
                          key: String(r.id),
                          title: r.title,
                      }))
                    : (await searchMangaNews(text)).map((r) => ({
                          key: r.id,
                          title: r.title,
                          subtitle: [r.year, r.authors]
                              .filter(Boolean)
                              .join(' · '),
                      })),
            ),
        );
    };

    const search = (event?: FormEvent) => {
        event?.preventDefault();
        void searchIn(source);
    };

    // Autre source : la même recherche, si elle était lancée.
    const changeSource = (value: string) => {
        const next = value as MetadataSource;
        setSource(next);
        setResults(undefined);
        setPreview(undefined);
        if (results) void searchIn(next);
    };

    const open = async (result: Result) =>
        setPreview(
            await run(async () =>
                source === 'wikipedia'
                    ? fromWikipedia(
                          await fetchWikipediaSeries(Number(result.key)),
                      )
                    : fromMangaNews(await fetchMangaNewsSeries(result.key)),
            ),
        );

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Rechercher la série"
            size="lg"
        >
            <Stack>
                <SegmentedControl
                    value={source}
                    onChange={changeSource}
                    data={SOURCES}
                />
                <form onSubmit={search}>
                    <Group align="flex-end" wrap="nowrap">
                        <TextInput
                            style={{ flex: 1 }}
                            placeholder="Nom de la série"
                            leftSection={<IconSearch size={16} />}
                            value={query}
                            onChange={(e) => setQuery(e.currentTarget.value)}
                            data-autofocus
                        />
                        <Button type="submit" loading={loading && !preview}>
                            Rechercher
                        </Button>
                    </Group>
                </form>
                {error && <Alert color="red">{error}</Alert>}
                {results?.length === 0 && (
                    <Text c="dimmed" size="sm">
                        Aucune série trouvée sur {SOURCE_LABELS[source]}. Essaie
                        un autre nom, ou le titre original.
                    </Text>
                )}

                {preview ? (
                    <Stack gap="xs">
                        <Group align="flex-start" wrap="nowrap">
                            {preview.coverUrl && (
                                <Image
                                    src={preview.coverUrl}
                                    w={110}
                                    radius="sm"
                                    alt=""
                                />
                            )}
                            <Stack gap={4}>
                                <Text fw={600}>{preview.title}</Text>
                                {preview.lines.map((line) => (
                                    <Text key={line} size="sm" c="dimmed">
                                        {line}
                                    </Text>
                                ))}
                                <Anchor
                                    href={preview.url}
                                    target="_blank"
                                    size="sm"
                                >
                                    Voir la fiche sur{' '}
                                    {SOURCE_LABELS[preview.source]}
                                </Anchor>
                            </Stack>
                        </Group>
                        {preview.sheet.summary && (
                            <Text
                                size="sm"
                                lineClamp={6}
                                style={{ whiteSpace: 'pre-line' }}
                            >
                                {preview.sheet.summary}
                            </Text>
                        )}
                        {!!preview.themes?.length && (
                            <Text size="xs" c="dimmed">
                                Thèmes : {preview.themes.join(', ')}
                            </Text>
                        )}
                        <Group justify="space-between">
                            <Button
                                variant="default"
                                onClick={() => setPreview(undefined)}
                            >
                                Retour aux résultats
                            </Button>
                            <Button
                                onClick={() => {
                                    onPick(preview);
                                    onClose();
                                }}
                            >
                                {actionLabel}
                            </Button>
                        </Group>
                    </Stack>
                ) : (
                    <Stack gap={4}>
                        {loading && results && <Loader size="sm" mx="auto" />}
                        {results?.map((result) => (
                            <Button
                                key={result.key}
                                variant="subtle"
                                color="gray"
                                justify="flex-start"
                                onClick={() => void open(result)}
                                h="auto"
                                py={6}
                            >
                                <Stack gap={0} align="flex-start">
                                    <Text size="sm">{result.title}</Text>
                                    {result.subtitle && (
                                        <Text size="xs" c="dimmed">
                                            {result.subtitle}
                                        </Text>
                                    )}
                                </Stack>
                            </Button>
                        ))}
                    </Stack>
                )}
                {footer && (
                    <>
                        <Divider />
                        {footer}
                    </>
                )}
            </Stack>
        </Modal>
    );
};
