import {
    Alert,
    Anchor,
    Button,
    Divider,
    Group,
    Image,
    Loader,
    Modal,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

import {
    type WikipediaDetails,
    type WikipediaResult,
    fetchWikipediaSeries,
    searchWikipedia,
} from '@/services/api';

/**
 * Recherche d'une série sur Wikipédia FR : résultats, aperçu de la fiche,
 * puis « Utiliser » renvoie la fiche choisie.
 */
export const WikipediaSearch = ({
    opened,
    onClose,
    kind,
    initialQuery,
    actionLabel = 'Utiliser cette fiche',
    onPick,
    footer,
}: {
    opened: boolean;
    onClose: () => void;
    kind: 'manga' | 'comics';
    initialQuery: string;
    actionLabel?: string;
    onPick: (details: WikipediaDetails) => void;
    /** Options et actions en bas de la fenêtre. */
    footer?: ReactNode;
}) => {
    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<WikipediaResult[]>();
    const [details, setDetails] = useState<WikipediaDetails>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();

    // Nouvelle ouverture : repartir de la série en cours d'édition.
    useEffect(() => {
        if (!opened) return;
        setQuery(initialQuery);
        setResults(undefined);
        setDetails(undefined);
        setError(undefined);
    }, [opened, initialQuery]);

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

    const search = async (event?: FormEvent) => {
        event?.preventDefault();
        if (!query.trim()) return;
        setDetails(undefined);
        setResults(await run(() => searchWikipedia(query.trim(), kind)));
    };

    const open = async (result: WikipediaResult) =>
        setDetails(await run(() => fetchWikipediaSeries(result.id)));

    const years = details?.firstYear
        ? details.lastYear
            ? `${details.firstYear} – ${details.lastYear}`
            : `depuis ${details.firstYear}`
        : undefined;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Rechercher la série sur Wikipédia"
            size="lg"
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
                        <Button type="submit" loading={loading && !details}>
                            Rechercher
                        </Button>
                    </Group>
                </form>
                {error && <Alert color="red">{error}</Alert>}
                {results?.length === 0 && (
                    <Text c="dimmed" size="sm">
                        Aucun article de {kind === 'manga' ? 'manga' : 'BD'}{' '}
                        trouvé. Essaie un autre nom, ou le titre original.
                    </Text>
                )}

                {details ? (
                    <Stack gap="xs">
                        <Group align="flex-start" wrap="nowrap">
                            {details.coverUrl && (
                                <Image
                                    src={details.coverUrl}
                                    w={110}
                                    radius="sm"
                                    alt=""
                                />
                            )}
                            <Stack gap={4}>
                                <Text fw={600}>{details.title}</Text>
                                {[
                                    details.genre,
                                    details.writer,
                                    details.publisher,
                                    years,
                                    details.volumeCount
                                        ? `${details.volumeCount} tomes`
                                        : undefined,
                                ]
                                    .filter(Boolean)
                                    .map((line) => (
                                        <Text key={line} size="sm" c="dimmed">
                                            {line}
                                        </Text>
                                    ))}
                                <Anchor
                                    href={details.url}
                                    target="_blank"
                                    size="sm"
                                >
                                    Voir l’article
                                </Anchor>
                            </Stack>
                        </Group>
                        {details.summary && (
                            <Text
                                size="sm"
                                lineClamp={6}
                                style={{ whiteSpace: 'pre-line' }}
                            >
                                {details.summary}
                            </Text>
                        )}
                        <Group justify="space-between">
                            <Button
                                variant="default"
                                onClick={() => setDetails(undefined)}
                            >
                                Retour aux résultats
                            </Button>
                            <Button
                                onClick={() => {
                                    onPick(details);
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
                                key={result.id}
                                variant="subtle"
                                color="gray"
                                justify="flex-start"
                                onClick={() => void open(result)}
                            >
                                {result.title}
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
