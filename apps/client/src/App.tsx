import {
    Anchor,
    AppShell,
    Avatar,
    Container,
    Group,
    Menu,
    Text,
    Title,
    UnstyledButton,
} from '@mantine/core';
import { IconLogout } from '@tabler/icons-react';
import { Link, Outlet, Route, Routes } from 'react-router';

import { RequireUser } from '@/components/RequireUser';
import { DeniedPage } from '@/pages/DeniedPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { SeriesPage } from '@/pages/SeriesPage';
import { ReaderPage } from '@/reader/ReaderPage';
import { logout, useCurrentUser } from '@/services/auth';

const UserMenu = () => {
    const user = useCurrentUser();
    return (
        <Menu position="bottom-end">
            <Menu.Target>
                <UnstyledButton aria-label="Mon compte">
                    <Avatar name={user.name} color="initials" size="md" />
                </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>
                    <Text size="sm" fw={500} c="bright">
                        {user.name}
                    </Text>
                    {user.role === 'admin' ? 'Administrateur' : 'Lecteur'}
                </Menu.Label>
                <Menu.Item
                    leftSection={<IconLogout size={14} />}
                    onClick={() => void logout()}
                >
                    Se déconnecter
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

/** Mise en page des écrans de navigation (le lecteur est en plein écran). */
const Layout = () => (
    <AppShell header={{ height: 56 }} padding="md">
        <AppShell.Header>
            <Container size="xl" h="100%">
                <Group h="100%" justify="space-between">
                    <Anchor
                        component={Link}
                        to="/"
                        underline="never"
                        c="inherit"
                    >
                        <Title order={3}>🍱 Bento</Title>
                    </Anchor>
                    <UserMenu />
                </Group>
            </Container>
        </AppShell.Header>
        <AppShell.Main>
            <Container size="xl">
                <Outlet />
            </Container>
        </AppShell.Main>
    </AppShell>
);

export const App = () => (
    <Routes>
        {/* Publique : explique un refus de connexion. */}
        <Route path="denied" element={<DeniedPage />} />
        <Route
            element={
                <RequireUser>
                    <Outlet />
                </RequireUser>
            }
        >
            <Route element={<Layout />}>
                <Route index element={<LibraryPage />} />
                <Route path="series/:id" element={<SeriesPage />} />
            </Route>
            <Route path="read/:id" element={<ReaderPage />} />
        </Route>
    </Routes>
);
