import {
    Alert,
    Badge,
    Button,
    Group,
    Image,
    Loader,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { IconPencil, IconWand } from '@tabler/icons-react';
import { Link } from 'react-router';

import { compareNames } from '@server/types';

import { fetchSeriesList, seriesCoverUrl } from '@/services/api';
import { useQuery } from '@/services/useQuery';

/**
 * Séries à classer (admin) : sans format ou sans âge. Sans âge, elles sont
 * masquées aux comptes limités. Chacune s'ouvre dans l'éditeur, au besoin
 * avec la recherche en ligne déjà lancée (une série à la fois).
 */
export const ToClassifyPage = () => {
    const { data, error } = useQuery(() => fetchSeriesList(), []);

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!data) return <Loader mx="auto" />;

    const series = data
        .filter((s) => !s.formatId || s.age === null)
        .sort((a, b) => compareNames(a.name, b.name));

    return (
        <Stack>
            <div>
                <Title order={2}>Séries à classer</Title>
                <Text size="sm" c="dimmed">
                    Séries sans format ou sans âge. Sans âge, une série est
                    masquée aux comptes limités (contrôle parental).
                </Text>
            </div>
            {series.length === 0 ? (
                <Alert color="green">Toutes les séries sont classées.</Alert>
            ) : (
                <Table.ScrollContainer minWidth={480}>
                    <Table verticalSpacing="xs">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th w={48} />
                                <Table.Th>Série ({series.length})</Table.Th>
                                <Table.Th>Manque</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {series.map((s) => (
                                <Table.Tr key={s.id}>
                                    <Table.Td>
                                        <Image
                                            src={seriesCoverUrl(s, 'small')}
                                            w={36}
                                            h={54}
                                            fit="cover"
                                            radius="xs"
                                            alt=""
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <Text
                                            component={Link}
                                            to={`/series/${s.id}`}
                                            size="sm"
                                        >
                                            {s.name}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap={4}>
                                            {!s.formatId && (
                                                <Badge
                                                    variant="light"
                                                    color="orange"
                                                >
                                                    Format
                                                </Badge>
                                            )}
                                            {s.age === null && (
                                                <Badge
                                                    variant="light"
                                                    color="red"
                                                >
                                                    Âge
                                                </Badge>
                                            )}
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group
                                            gap="xs"
                                            justify="flex-end"
                                            wrap="nowrap"
                                        >
                                            <Button
                                                component={Link}
                                                to={`/series/${s.id}/edit?fill=online`}
                                                size="xs"
                                                variant="light"
                                                leftSection={
                                                    <IconWand size={14} />
                                                }
                                            >
                                                Remplir
                                            </Button>
                                            <Button
                                                component={Link}
                                                to={`/series/${s.id}/edit`}
                                                size="xs"
                                                variant="default"
                                                leftSection={
                                                    <IconPencil size={14} />
                                                }
                                            >
                                                Modifier
                                            </Button>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
        </Stack>
    );
};
