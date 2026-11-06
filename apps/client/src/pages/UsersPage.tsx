import {
    Alert,
    Badge,
    Loader,
    Select,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { useState } from 'react';

import { ageLimitOptions, useAgeSteps } from '@/components/ageLimits';
import { type Account, fetchUsers, setUserMaxAge } from '@/services/api';
import { useQuery } from '@/services/useQuery';

// Valeur du choix « Sans limite » (Select n'accepte pas de valeur vide).
const NO_LIMIT = 'none';

/** Comptes et contrôle parental (admin). */
export const UsersPage = () => {
    const { data: users, error, reload } = useQuery(fetchUsers, []);
    const ages = useAgeSteps();
    const [saveError, setSaveError] = useState<string>();

    const change = async (user: Account, value: string | null) => {
        setSaveError(undefined);
        try {
            await setUserMaxAge(
                user.id,
                value === NO_LIMIT || value === null ? null : Number(value),
            );
            reload();
        } catch (e) {
            setSaveError((e as Error).message);
        }
    };

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!users) return <Loader mx="auto" />;

    return (
        <Stack>
            <Title order={2}>Comptes</Title>
            <Text size="sm" c="dimmed">
                Les comptes apparaissent à leur première connexion. Un compte
                limité ne voit que les séries dont la classification est sous sa
                limite ; les séries sans classification lui sont masquées. Les
                administrateurs voient tout.
            </Text>
            {saveError && <Alert color="red">{saveError}</Alert>}
            <Table.ScrollContainer minWidth={480}>
                <Table verticalSpacing="sm">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Personne</Table.Th>
                            <Table.Th>Rôle</Table.Th>
                            <Table.Th>Séries visibles</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {users.map((user) => (
                            <Table.Tr key={user.id}>
                                <Table.Td>
                                    <Text size="sm" fw={500}>
                                        {user.name}
                                    </Text>
                                    {user.email && (
                                        <Text size="xs" c="dimmed">
                                            {user.email}
                                        </Text>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    <Badge
                                        variant="light"
                                        color={
                                            user.role === 'admin'
                                                ? 'grape'
                                                : 'gray'
                                        }
                                    >
                                        {user.role === 'admin'
                                            ? 'Admin'
                                            : 'Lecteur'}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    {user.role === 'admin' ? (
                                        <Text size="sm" c="dimmed">
                                            Toutes
                                        </Text>
                                    ) : (
                                        <Select
                                            size="xs"
                                            w={200}
                                            allowDeselect={false}
                                            aria-label={`Âge maximal de ${user.name}`}
                                            value={String(
                                                user.maxAge ?? NO_LIMIT,
                                            )}
                                            onChange={(value) =>
                                                void change(user, value)
                                            }
                                            data={ageLimitOptions(
                                                ages,
                                                user.maxAge,
                                            ).map((limit) => ({
                                                value: String(
                                                    limit.value ?? NO_LIMIT,
                                                ),
                                                label: limit.label,
                                            }))}
                                        />
                                    )}
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Stack>
    );
};
