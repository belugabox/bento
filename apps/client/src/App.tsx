import { AppShell, Center, Container, Loader } from '@mantine/core';
import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';

import { ActivationBanner, AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/AppNav';
import { ModeLine } from '@/components/ModeBadges';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PageLoader } from '@/components/PageLoader';
import { RequireUser } from '@/components/RequireUser';
import {
    BOTTOM_NAV_HEIGHT,
    useBottomNav,
    useBrowsePage,
} from '@/components/navigation';
import { useScrollToTop } from '@/components/scrollToTop';
import { DownloadsPage } from '@/pages/DownloadsPage';
import { HomePage } from '@/pages/HomePage';
import { useCurrentUser } from '@/services/auth';

// Dans le fichier principal : l'accueil, et les téléchargements (l'accueil
// les montre hors ligne). Le reste est chargé à la demande, pour que
// l'accueil s'ouvre plus vite ; le service worker garde tous les fichiers,
// hors ligne compris.
const loadLibrary = () => import('@/pages/LibraryPage');
const loadSeries = () => import('@/pages/SeriesPage');
const loadMe = () => import('@/pages/MePage');
const loadReader = () => import('@/reader/ReaderPage');

const LibraryPage = lazy(() =>
    loadLibrary().then((m) => ({ default: m.LibraryPage })),
);
const SeriesPage = lazy(() =>
    loadSeries().then((m) => ({ default: m.SeriesPage })),
);
const MePage = lazy(() => loadMe().then((m) => ({ default: m.MePage })));
const ReaderPage = lazy(() =>
    loadReader().then((m) => ({ default: m.ReaderPage })),
);
const LoginPage = lazy(() =>
    import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const JoinPage = lazy(() =>
    import('@/pages/JoinPage').then((m) => ({ default: m.JoinPage })),
);

/**
 * Une fois l'appli affichée, les pages principales se chargent en
 * arrière-plan : passer d'un onglet à l'autre reste immédiat.
 */
const usePreloadPages = () =>
    useEffect(() => {
        const preload = () => {
            void loadLibrary();
            void loadSeries();
            void loadMe();
            void loadReader();
        };
        if ('requestIdleCallback' in window) {
            const id = window.requestIdleCallback(preload, { timeout: 3000 });
            return () => window.cancelIdleCallback(id);
        }
        const timer = setTimeout(preload, 1500);
        return () => clearTimeout(timer);
    }, []);

/** Chargement du lecteur : plein écran noir, comme lui. */
const ReaderLoader = () => (
    <Center h="100dvh" bg="black">
        <Loader color="gray" />
    </Center>
);

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
const MyStatsPage = lazy(() =>
    import('@/pages/MyStatsPage').then((m) => ({ default: m.MyStatsPage })),
);
const ReaderStatsPage = lazy(() =>
    import('@/pages/ReaderStatsPage').then((m) => ({
        default: m.ReaderStatsPage,
    })),
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
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
    ) : (
        <Navigate to="/" replace />
    );

/**
 * Mise en page des écrans de navigation (le lecteur est en plein écran) :
 * l'en-tête, et sur téléphone et tablette la barre d'onglets du bas.
 */
const Layout = () => {
    const bottomNav = useBottomNav();
    // Une page ouverte commence en haut (pas au défilement de la précédente).
    useScrollToTop();
    // Retour d'une fiche série : la page parcourue avant.
    useBrowsePage();
    usePreloadPages();
    return (
        <AppShell
            header={{ height: 56 }}
            footer={{
                // Plus la marge du bas des téléphones sans bouton.
                height: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
                collapsed: !bottomNav,
            }}
            padding="md"
        >
            <AppShell.Header>
                <Container size="xl" h="100%">
                    <AppHeader />
                </Container>
            </AppShell.Header>
            {bottomNav && (
                <AppShell.Footer
                    style={{
                        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                    }}
                >
                    <BottomNav />
                </AppShell.Footer>
            )}
            <AppShell.Main>
                <Container size="xl">
                    <OfflineBanner />
                    <ActivationBanner />
                    {/* Pages chargées à la demande. */}
                    <Suspense fallback={<PageLoader />}>
                        <Outlet />
                    </Suspense>
                </Container>
            </AppShell.Main>
        </AppShell>
    );
};

export const App = () => (
    <Routes>
        {/* Publiques : connexion, et liens envoyés par l'admin. */}
        <Route
            path="login"
            element={
                <Suspense fallback={<PageLoader />}>
                    <LoginPage />
                </Suspense>
            }
        />
        <Route
            path="join/:token"
            element={
                <Suspense fallback={<PageLoader />}>
                    <JoinPage />
                </Suspense>
            }
        />
        <Route
            element={
                <RequireUser>
                    {/* Vue lecteur, copie de la prod : un liseré partout. */}
                    <ModeLine />
                    <Outlet />
                </RequireUser>
            }
        >
            <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="library" element={<LibraryPage />} />
                <Route path="me" element={<MePage />} />
                <Route path="series/:id" element={<SeriesPage />} />
                {/* Dans le fichier principal : l'accueil la montre hors
                    ligne. */}
                <Route path="downloads" element={<DownloadsPage />} />
                <Route
                    path="account"
                    element={
                        <Suspense fallback={<PageLoader />}>
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
                <Route path="me/stats" element={<MyStatsPage />} />
                <Route
                    path="stats/readers/:id"
                    element={
                        <AdminOnly>
                            <ReaderStatsPage />
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
            <Route
                path="read/:id"
                element={
                    <Suspense fallback={<ReaderLoader />}>
                        <ReaderPage />
                    </Suspense>
                }
            />
        </Route>
    </Routes>
);
