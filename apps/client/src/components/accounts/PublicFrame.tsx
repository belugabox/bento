import { Center, Group, Image, Paper, Stack, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import logo from '@/assets/logo.svg';

/** Cadre des pages sans session : connexion, invitation… */
export const PublicFrame = ({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) => (
    <Center mih="100dvh" p="md">
        <Stack w="100%" maw={420} gap="lg">
            <Group justify="center" gap="xs">
                <Image src={logo} alt="" w={36} h={36} />
                <Title order={2}>Bento</Title>
            </Group>
            <Paper withBorder radius="md" p="lg">
                <Stack>
                    <Title order={3} ta="center">
                        {title}
                    </Title>
                    {children}
                </Stack>
            </Paper>
        </Stack>
    </Center>
);
