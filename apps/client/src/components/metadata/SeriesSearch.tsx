import {
    Alert,
    Anchor,
    Button,
    Divider,
    Group,
    Image,
    Loader,
    Modal,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

import { type MetadataSource, SOURCE_LABELS, genreKey } from '@server/types';

import { searchMangaNews, searchWikipedia } from '@/services/api';

import {
    type FoundSeries,
    type Preview,
    loadFound,
    sitesFor,
} from './onlineSheets';

type Result = { key: string; title: string; subtitle?: string };

/** Une colonne de la recherche : les résultats d'un site, et la fiche ouverte. */
type Column = {
    loading: boolean;
    results?: Result[];
    error?: string;
    chosen?: Preview;
};

const EMPTY: Record<MetadataSource, Column> = {
    'manga-news': { loading: false },
    wikipedia: { loading: false },
};

/**
 * Recherche d'une série en ligne, sur Manga-news et Wikipédia FR à la fois.
 * Une fiche ouverte de chaque côté, au plus : `onCompare` les reçoit
 * ensemble (éditeur), ou `onPick` en reçoit une (image de couverture).
 */
export const SeriesSearch = ({
    opened,
    onClose,
    kind,
    initialQuery,
    actionLabel = 'Utiliser cette fiche',
    onPick,
    onCompare,
    footer,
    autoSearch = false,
}: {
    opened: boolean;
    onClose: () => void;
    kind: 'manga' | 'comics';
    initialQuery: string;
    actionLabel?: string;
    onPick?: (found: FoundSeries) => void;
    onCompare?: (found: FoundSeries[]) => void;
    /** Options et actions en bas de la fenêtre. */
    footer?: ReactNode;
    /** Lancer la recherche dès l'ouverture (série à classer). */
    autoSearch?: boolean;
}) => {
    const sites = sitesFor(kind);
    const [query, setQuery] = useState(initialQuery);
    const [columns, setColumns] = useState(EMPTY);

    const update = (site: MetadataSource, changes: Partial<Column>) =>
        setColumns((current) => ({
            ...current,
            [site]: { ...current[site], ...changes },
        }));

    const open = async (site: MetadataSource, key: string) => {
        update(site, { loading: true, error: undefined });
        try {
            update(site, {
                loading: false,
                chosen: await loadFound({ site, id: key }),
            });
        } catch (e) {
            update(site, { loading: false, error: (e as Error).message });
        }
    };

    const searchOn = async (site: MetadataSource, text: string) => {
        update(site, {
            loading: true,
            error: undefined,
            results: undefined,
            chosen: undefined,
        });
        try {
            const results =
                site === 'wikipedia'
                    ? (await searchWikipedia(text)).map((r) => ({
                          key: String(r.id),
                          title: r.title,
                      }))
                    : (await searchMangaNews(text)).map((r) => ({
                          key: r.id,
                          title: r.title,
                          subtitle: [r.year, r.authors]
                              .filter(Boolean)
                              .join(' · '),
                      }));
            update(site, { loading: false, results });
            // Un seul résultat au nom exact : sa fiche s'ouvre d'elle-même.
            const exact = results.filter(
                (r) => genreKey(r.title) === genreKey(text),
            );
            if (exact.length === 1) await open(site, exact[0]!.key);
        } catch (e) {
            update(site, { loading: false, error: (e as Error).message });
        }
    };

    const searchAll = (wanted = query) => {
        const text = wanted.trim();
        if (!text) return;
        for (const site of sites) void searchOn(site, text);
    };

    // Nouvelle ouverture : repartir de la série en cours d'édition.
    useEffect(() => {
        if (!opened) return;
        setQuery(initialQuery);
        setColumns(EMPTY);
        if (autoSearch) searchAll(initialQuery);
        // `searchAll` change à chaque rendu : seule l'ouverture compte.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, initialQuery, autoSearch]);

    const search = (event?: FormEvent) => {
        event?.preventDefault();
        searchAll();
    };

    const chosen = sites.flatMap((site) => columns[site].chosen ?? []);
    const busy = sites.some((site) => columns[site].loading);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Rechercher la série"
            size="xl"
        >
            <Stack>
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
                        <Button type="submit" loading={busy}>
                            Rechercher
                        </Button>
                    </Group>
                </form>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                    {sites.map((site) => (
                        <SiteColumn
                            key={site}
                            site={site}
                            column={columns[site]}
                            onOpen={(key) => void open(site, key)}
                            onBack={() => update(site, { chosen: undefined })}
                            action={
                                onPick &&
                                ((found) => {
                                    onPick(found);
                                    onClose();
                                })
                            }
                            actionLabel={actionLabel}
                        />
                    ))}
                </SimpleGrid>

                {onCompare && (
                    <Group justify="flex-end">
                        <Button
                            disabled={chosen.length === 0}
                            onClick={() => {
                                onCompare(chosen);
                                onClose();
                            }}
                        >
                            {chosen.length > 1
                                ? 'Comparer les 2 fiches'
                                : 'Comparer la fiche'}
                        </Button>
                    </Group>
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

/** Résultats d'un site, ou la fiche ouverte. */
const SiteColumn = ({
    site,
    column: { loading, results, error, chosen },
    onOpen,
    onBack,
    action,
    actionLabel,
}: {
    site: MetadataSource;
    column: Column;
    onOpen: (key: string) => void;
    onBack: () => void;
    action?: (found: FoundSeries) => void;
    actionLabel: string;
}) => (
    <Stack gap="xs" component="section" aria-label={SOURCE_LABELS[site]}>
        <Group gap="xs">
            <Title order={5}>{SOURCE_LABELS[site]}</Title>
            {loading && <Loader size="xs" />}
        </Group>
        {error && (
            <Alert color="red" p="xs">
                {error}
            </Alert>
        )}
        {chosen ? (
            <Stack gap="xs">
                <Group align="flex-start" wrap="nowrap">
                    {chosen.coverUrl && (
                        <Image
                            src={chosen.coverUrl}
                            w={80}
                            radius="sm"
                            alt=""
                        />
                    )}
                    <Stack gap={2}>
                        <Text fw={600}>{chosen.title}</Text>
                        {chosen.lines.map((line) => (
                            <Text key={line} size="xs" c="dimmed">
                                {line}
                            </Text>
                        ))}
                        <Anchor href={chosen.url} target="_blank" size="xs">
                            Voir la fiche sur {SOURCE_LABELS[site]}
                        </Anchor>
                    </Stack>
                </Group>
                {chosen.sheet.summary && (
                    <Text
                        size="xs"
                        lineClamp={4}
                        style={{ whiteSpace: 'pre-line' }}
                    >
                        {chosen.sheet.summary}
                    </Text>
                )}
                {!!chosen.themes?.length && (
                    <Text size="xs" c="dimmed">
                        Thèmes : {chosen.themes.join(', ')}
                    </Text>
                )}
                <Group justify="space-between">
                    <Button size="xs" variant="default" onClick={onBack}>
                        {results ? 'Autre résultat' : 'Retirer'}
                    </Button>
                    {action && (
                        <Button size="xs" onClick={() => action(chosen)}>
                            {actionLabel}
                        </Button>
                    )}
                </Group>
            </Stack>
        ) : (
            <Stack gap={4}>
                {results?.length === 0 && (
                    <Text c="dimmed" size="sm">
                        Aucune série trouvée. Essaie un autre nom, ou le titre
                        original.
                    </Text>
                )}
                {results?.map((result) => (
                    <Button
                        key={result.key}
                        variant="subtle"
                        color="gray"
                        justify="flex-start"
                        onClick={() => onOpen(result.key)}
                        h="auto"
                        py={6}
                    >
                        <Stack gap={0} align="flex-start">
                            <Text size="sm" style={{ whiteSpace: 'normal' }}>
                                {result.title}
                            </Text>
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
    </Stack>
);
