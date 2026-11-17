import {
    ActionIcon,
    Alert,
    Anchor,
    Button,
    Group,
    Image,
    Indicator,
    Loader,
    Popover,
    Progress,
    Stack,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconActivity, IconInbox, IconSearch } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import logo from '@/assets/logo.svg';
import { DownloadIndicator } from '@/components/DownloadIndicator';
import { UserAvatar } from '@/components/accounts/UserAvatar';
import { ageLimitLabel } from '@/components/ageLimits';
import { NAV_ITEMS, navSection, useBottomNav } from '@/components/navigation';
import { switchView } from '@/components/switchView';
import {
    DRAFTS_CHANGED,
    type Task,
    fetchPendingDrafts,
    fetchTasks,
    stopPreview,
} from '@/services/api';
import { useCurrentUser } from '@/services/auth';

const REFRESH_MS = 60_000;
// Tâches : suivies de près pendant qu'il y en a, sinon de temps en temps.
const TASKS_ACTIVE_MS = 2_000;
const TASKS_IDLE_MS = 15_000;

/** Icône des brouillons, avec le nombre de séries en attente (admin). */
const DraftsIndicator = () => {
    const location = useLocation();
    const [pending, setPending] = useState(0);

    // À chaque changement de page (publication) et régulièrement.
    useEffect(() => {
        const load = () =>
            fetchPendingDrafts()
                .then(({ series }) => setPending(series))
                .catch(() => undefined);
        void load();
        const timer = setInterval(() => void load(), REFRESH_MS);
        window.addEventListener(DRAFTS_CHANGED, load);
        return () => {
            clearInterval(timer);
            window.removeEventListener(DRAFTS_CHANGED, load);
        };
    }, [location.pathname]);

    return (
        <Tooltip
            label={
                pending
                    ? `${pending} série${pending > 1 ? 's' : ''} en attente`
                    : 'Brouillons'
            }
        >
            <Indicator
                label={pending}
                size={18}
                disabled={pending === 0}
                offset={4}
            >
                <ActionIcon
                    component={Link}
                    to="/drafts"
                    variant="subtle"
                    color="gray"
                    size="lg"
                    aria-label="Brouillons"
                >
                    <IconInbox size={20} />
                </ActionIcon>
            </Indicator>
        </Tooltip>
    );
};

/** Icône des tâches de fond en cours (scan, compression…), pour l'admin. */
const TasksIndicator = () => {
    const location = useLocation();
    const [tasks, setTasks] = useState<Task[]>([]);

    // Au changement de page (une action a pu en lancer une) et régulièrement.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        let stopped = false;
        const load = async () => {
            const current = await fetchTasks().catch(() => undefined);
            if (stopped) return;
            if (current) setTasks(current);
            timer = setTimeout(
                () => void load(),
                current?.length ? TASKS_ACTIVE_MS : TASKS_IDLE_MS,
            );
        };
        void load();
        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [location.pathname]);

    const running = tasks.length > 0;
    return (
        <Popover position="bottom-end" width={300} shadow="md">
            <Popover.Target>
                <Indicator
                    label={tasks.length}
                    size={18}
                    disabled={!running}
                    offset={4}
                >
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="lg"
                        aria-label={
                            running
                                ? `${tasks.length} tâche(s) en cours`
                                : 'Tâches'
                        }
                    >
                        {running ? (
                            <Loader size={18} />
                        ) : (
                            <IconActivity size={20} />
                        )}
                    </ActionIcon>
                </Indicator>
            </Popover.Target>
            <Popover.Dropdown>
                {running ? (
                    <Stack gap="sm">
                        {tasks.map((task) => (
                            <Stack key={task.id} gap={4}>
                                <Group
                                    justify="space-between"
                                    gap="xs"
                                    wrap="nowrap"
                                >
                                    <Text size="sm" lineClamp={1}>
                                        {task.label}
                                    </Text>
                                    {task.total !== undefined && (
                                        <Text
                                            size="xs"
                                            c="dimmed"
                                            style={{ flexShrink: 0 }}
                                        >
                                            {task.done} / {task.total}
                                        </Text>
                                    )}
                                </Group>
                                <Progress
                                    size="sm"
                                    value={
                                        task.total
                                            ? ((task.done ?? 0) / task.total) *
                                              100
                                            : 100
                                    }
                                    animated={!task.total}
                                    striped={!task.total}
                                    aria-label={task.label}
                                />
                            </Stack>
                        ))}
                    </Stack>
                ) : (
                    <Text size="sm" c="dimmed">
                        Aucune tâche en cours.
                    </Text>
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

/** Liens de l'en-tête, sur un ordinateur (sinon : la barre d'onglets). */
const HeaderLinks = () => {
    const { pathname } = useLocation();
    return (
        <Group gap={4} wrap="nowrap">
            {NAV_ITEMS.filter((item) => item.to !== '/me').map((item) => (
                <Button
                    key={item.to}
                    component={Link}
                    to={item.to}
                    variant={
                        navSection(pathname) === item.to ? 'light' : 'subtle'
                    }
                    color={
                        navSection(pathname) === item.to ? undefined : 'gray'
                    }
                    size="compact-md"
                    fw={500}
                    aria-current={
                        navSection(pathname) === item.to ? 'page' : undefined
                    }
                >
                    {item.label}
                </Button>
            ))}
        </Group>
    );
};

/**
 * Recherche : ouvre la bibliothèque, son champ de recherche prêt à taper
 * (déjà ouverte : ses filtres sont gardés).
 */
const SearchButton = () => {
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <Tooltip label="Rechercher">
            <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                aria-label="Rechercher"
                onClick={() =>
                    void navigate(
                        location.pathname === '/library'
                            ? `/library${location.search}`
                            : '/library',
                        {
                            replace: location.pathname === '/library',
                            state: { focusSearch: Date.now() },
                        },
                    )
                }
            >
                <IconSearch size={20} />
            </ActionIcon>
        </Tooltip>
    );
};

/**
 * En-tête : logo, liens (ordinateur), recherche, téléchargements, tâches et
 * brouillons (admin), et l'avatar qui mène à « Moi » (ordinateur ; sinon
 * l'onglet du bas).
 */
export const AppHeader = () => {
    const user = useCurrentUser();
    const bottomNav = useBottomNav();
    return (
        <Group h="100%" justify="space-between" gap="sm" wrap="nowrap">
            <Group gap="lg" wrap="nowrap">
                <Anchor component={Link} to="/" underline="never" c="inherit">
                    <Group gap={10} wrap="nowrap">
                        <Image src={logo} alt="" w={30} h={30} />
                        <Title
                            order={1}
                            fz={22}
                            fw={800}
                            lh={1}
                            style={{ letterSpacing: '-0.02em' }}
                        >
                            Bento
                        </Title>
                    </Group>
                </Anchor>
                {!bottomNav && <HeaderLinks />}
            </Group>
            <Group gap="sm" wrap="nowrap">
                <SearchButton />
                <DownloadIndicator />
                {user.role === 'admin' && <TasksIndicator />}
                {user.role === 'admin' && <DraftsIndicator />}
                {!bottomNav && (
                    <UnstyledButton component={Link} to="/me" aria-label="Moi">
                        <UserAvatar
                            name={user.name}
                            seed={user.avatarSeed}
                            size="md"
                            radius="xl"
                        />
                    </UnstyledButton>
                )}
            </Group>
        </Group>
    );
};

/** Rappel de la vue lecteur d'un admin, avec retour à la vue admin. */
/**
 * Compte venu de Pocket ID, encore connecté : il doit choisir son
 * identifiant et son mot de passe pour pouvoir se reconnecter.
 */
export const ActivationBanner = () => {
    const { hasPassword, preview } = useCurrentUser();
    const { pathname } = useLocation();
    // Compte simulé par l'admin : ce n'est pas à lui de l'activer.
    if (hasPassword || preview?.user || pathname === '/account') return null;
    return (
        <Alert color="orange" variant="light" mb="md" py="xs">
            <Group justify="space-between">
                <Text size="sm">
                    Bento n’utilise plus Pocket ID : choisis ton identifiant et
                    ton mot de passe pour pouvoir te reconnecter.
                </Text>
                <Button
                    size="xs"
                    variant="light"
                    color="orange"
                    component={Link}
                    to="/account"
                >
                    Choisir
                </Button>
            </Group>
        </Alert>
    );
};

export const PreviewBanner = () => {
    const { preview } = useCurrentUser();
    if (!preview) return null;
    return (
        <Alert color="orange" variant="light" mb="md" py="xs">
            <Group justify="space-between">
                <Text size="sm">
                    {preview.user ? (
                        <>
                            Vue de <b>{preview.user.name}</b>, en lecture seule
                            : rien n’est enregistré.
                        </>
                    ) : (
                        <>
                            Vue lecteur :{' '}
                            {ageLimitLabel(preview.maxAge).toLowerCase()}. Les
                            écrans d’administration sont masqués.
                        </>
                    )}
                </Text>
                <Button
                    size="xs"
                    variant="light"
                    color="orange"
                    onClick={() => void switchView(stopPreview)}
                >
                    Revenir à la vue admin
                </Button>
            </Group>
        </Alert>
    );
};
