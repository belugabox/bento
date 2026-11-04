import {
    AppShell,
    Badge,
    Center,
    Group,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useEffect, useState } from 'react';

import { api, json } from '@/services/api';

type Health = { status: 'ok'; version: string };

export const App = () => {
    const [health, setHealth] = useState<Health>();
    const [error, setError] = useState<string>();

    useEffect(() => {
        json(api.health.$get())
            .then(setHealth)
            .catch((e: Error) => setError(e.message));
    }, []);

    return (
        <AppShell header={{ height: 56 }} padding="md">
            <AppShell.Header>
                <Group h="100%" px="md">
                    <Title order={3}>🍱 Bento</Title>
                </Group>
            </AppShell.Header>
            <AppShell.Main>
                <Center mih="60vh">
                    <Stack align="center" gap="xs">
                        <Text c="dimmed">Bibliothèque de mangas et BD</Text>
                        {health && (
                            <Badge color="teal" variant="light">
                                Serveur en ligne · v{health.version}
                            </Badge>
                        )}
                        {error && (
                            <Badge color="red" variant="light">
                                Serveur injoignable : {error}
                            </Badge>
                        )}
                    </Stack>
                </Center>
            </AppShell.Main>
        </AppShell>
    );
};
