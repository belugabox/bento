import { AppShell, Container } from '@mantine/core';
import { Navigate, Outlet, Route, Routes } from 'react-router';

import { AppHeader, PreviewBanner } from '@/components/AppHeader';
import { RequireUser } from '@/components/RequireUser';
import { CollectionsPage } from '@/pages/CollectionsPage';
import { DeniedPage } from '@/pages/DeniedPage';
import { DraftsPage } from '@/pages/DraftsPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { SeriesEditPage } from '@/pages/SeriesEditPage';
import { SeriesPage } from '@/pages/SeriesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StatsPage } from '@/pages/StatsPage';
import { UsersPage } from '@/pages/UsersPage';
import { ReaderPage } from '@/reader/ReaderPage';
import { useCurrentUser } from '@/services/auth';

/** Réservé aux admins ; les autres reviennent à l'accueil. */
const AdminOnly = ({ children }: { children: React.ReactNode }) =>
    useCurrentUser().role === 'admin' ? children : <Navigate to="/" replace />;

/** Mise en page des écrans de navigation (le lecteur est en plein écran). */
const Layout = () => (
    <AppShell header={{ height: 56 }} padding="md">
        <AppShell.Header>
            <Container size="xl" h="100%">
                <AppHeader />
            </Container>
        </AppShell.Header>
        <AppShell.Main>
            <Container size="xl">
                <PreviewBanner />
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
                <Route
                    path="drafts"
                    element={
                        <AdminOnly>
                            <DraftsPage />
                        </AdminOnly>
                    }
                />
                <Route
                    path="series/:id/edit"
                    element={
                        <AdminOnly>
                            <SeriesEditPage />
                        </AdminOnly>
                    }
                />
                <Route
                    path="stats"
                    element={
                        <AdminOnly>
                            <StatsPage />
                        </AdminOnly>
                    }
                />
                <Route
                    path="users"
                    element={
                        <AdminOnly>
                            <UsersPage />
                        </AdminOnly>
                    }
                />
                <Route
                    path="settings"
                    element={
                        <AdminOnly>
                            <SettingsPage />
                        </AdminOnly>
                    }
                />
                <Route
                    path="collections"
                    element={
                        <AdminOnly>
                            <CollectionsPage />
                        </AdminOnly>
                    }
                />
            </Route>
            <Route path="read/:id" element={<ReaderPage />} />
        </Route>
    </Routes>
);
