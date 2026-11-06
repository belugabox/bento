import { AppShell, Container, Loader } from '@mantine/core';
import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';

import { AppHeader, PreviewBanner } from '@/components/AppHeader';
import { RequireUser } from '@/components/RequireUser';
import { DeniedPage } from '@/pages/DeniedPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { SeriesPage } from '@/pages/SeriesPage';
import { ReaderPage } from '@/reader/ReaderPage';
import { useCurrentUser } from '@/services/auth';

// Pages de l'admin : chargées à la demande, les lecteurs n'en téléchargent
// pas le code (éditeur, recherche de métadonnées…).
const CollectionsPage = lazy(() =>
    import('@/pages/CollectionsPage').then((m) => ({
        default: m.CollectionsPage,
    })),
);
const DraftsPage = lazy(() =>
    import('@/pages/DraftsPage').then((m) => ({ default: m.DraftsPage })),
);
const SeriesEditPage = lazy(() =>
    import('@/pages/SeriesEditPage').then((m) => ({
        default: m.SeriesEditPage,
    })),
);
const SettingsPage = lazy(() =>
    import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const StatsPage = lazy(() =>
    import('@/pages/StatsPage').then((m) => ({ default: m.StatsPage })),
);
const UsersPage = lazy(() =>
    import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })),
);

/** Réservé aux admins ; les autres reviennent à l'accueil. */
const AdminOnly = ({ children }: { children: React.ReactNode }) =>
    useCurrentUser().role === 'admin' ? (
        <Suspense fallback={<Loader mx="auto" />}>{children}</Suspense>
    ) : (
        <Navigate to="/" replace />
    );

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
