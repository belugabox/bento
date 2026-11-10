import { AppShell, Container, Loader } from '@mantine/core';
import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';

import {
    ActivationBanner,
    AppHeader,
    PreviewBanner,
} from '@/components/AppHeader';
import { OfflineBanner } from '@/components/OfflineBanner';
import { RequireUser } from '@/components/RequireUser';
import { DownloadsPage } from '@/pages/DownloadsPage';
import { JoinPage } from '@/pages/JoinPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { LoginPage } from '@/pages/LoginPage';
import { SeriesPage } from '@/pages/SeriesPage';
import { ReaderPage } from '@/reader/ReaderPage';
import { useCurrentUser } from '@/services/auth';

// Pages de l'admin : chargées à la demande, les lecteurs n'en téléchargent
// pas le code (éditeur, recherche de métadonnées…).
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
const SeriesManagementPage = lazy(() =>
    import('@/pages/SeriesManagementPage').then((m) => ({
        default: m.SeriesManagementPage,
    })),
);
const AccountPage = lazy(() =>
    import('@/pages/AccountPage').then((m) => ({ default: m.AccountPage })),
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
                <OfflineBanner />
                <PreviewBanner />
                <ActivationBanner />
                <Outlet />
            </Container>
        </AppShell.Main>
    </AppShell>
);

export const App = () => (
    <Routes>
        {/* Publiques : connexion, et liens envoyés par l'admin. */}
        <Route path="login" element={<LoginPage />} />
        <Route path="join/:token" element={<JoinPage />} />
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
                {/* Pas chargée à la demande : sert aussi hors ligne. */}
                <Route path="downloads" element={<DownloadsPage />} />
                <Route
                    path="account"
                    element={
                        <Suspense fallback={<Loader mx="auto" />}>
                            <AccountPage />
                        </Suspense>
                    }
                />
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
                    path="manage"
                    element={
                        <AdminOnly>
                            <SeriesManagementPage />
                        </AdminOnly>
                    }
                />
                {/* Ancienne adresse de « Séries à classer ». */}
                <Route
                    path="to-classify"
                    element={<Navigate to="/manage" replace />}
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
            </Route>
            <Route path="read/:id" element={<ReaderPage />} />
        </Route>
    </Routes>
);
