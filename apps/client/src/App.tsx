import { Anchor, AppShell, Container, Group, Title } from '@mantine/core';
import { Link, Outlet, Route, Routes } from 'react-router';

import { LibraryPage } from '@/pages/LibraryPage';
import { SeriesPage } from '@/pages/SeriesPage';
import { ReaderPage } from '@/reader/ReaderPage';

/** Mise en page des écrans de navigation (le lecteur est en plein écran). */
const Layout = () => (
    <AppShell header={{ height: 56 }} padding="md">
        <AppShell.Header>
            <Container size="xl" h="100%">
                <Group h="100%">
                    <Anchor
                        component={Link}
                        to="/"
                        underline="never"
                        c="inherit"
                    >
                        <Title order={3}>🍱 Bento</Title>
                    </Anchor>
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
        <Route element={<Layout />}>
            <Route index element={<LibraryPage />} />
            <Route path="series/:id" element={<SeriesPage />} />
        </Route>
        <Route path="read/:id" element={<ReaderPage />} />
    </Routes>
);
