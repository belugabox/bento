import {
    ActionIcon,
    Alert,
    Anchor,
    Avatar,
    Button,
    Group,
    Indicator,
    Menu,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconEye, IconInbox, IconLogout, IconUsers } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';

import { AGE_LIMITS, ageLimitLabel } from '@/components/ageLimits';
import { fetchPendingDrafts, startPreview, stopPreview } from '@/services/api';
import { logout, useCurrentUser } from '@/services/auth';

const REFRESH_MS = 60_000;

/** Change de vue (lecteur ou admin) : tout l'écran se recharge. */
const switchView = async (action: () => Promise<unknown>) => {
    await action();
    window.location.assign('/');
};

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
        return () => clearInterval(timer);
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
                color="orange"
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

const UserMenu = () => {
    const user = useCurrentUser();
    const isAdmin = user.role === 'admin';
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
                    {user.preview
                        ? `Vue lecteur · ${ageLimitLabel(user.preview.maxAge)}`
                        : isAdmin
                          ? 'Administrateur'
                          : 'Lecteur'}
                </Menu.Label>
                {isAdmin && (
                    <Menu.Item
                        component={Link}
                        to="/users"
                        leftSection={<IconUsers size={14} />}
                    >
                        Comptes et contrôle parental
                    </Menu.Item>
                )}
                {(isAdmin || user.preview) && (
                    <>
                        <Menu.Divider />
                        <Menu.Label>Voir comme un lecteur</Menu.Label>
                        {AGE_LIMITS.map((limit) => (
                            <Menu.Item
                                key={String(limit.value)}
                                leftSection={<IconEye size={14} />}
                                disabled={
                                    !!user.preview &&
                                    user.preview.maxAge === limit.value
                                }
                                onClick={() =>
                                    void switchView(() =>
                                        startPreview(limit.value),
                                    )
                                }
                            >
                                {limit.label}
                            </Menu.Item>
                        ))}
                        {user.preview && (
                            <Menu.Item
                                color="orange"
                                onClick={() => void switchView(stopPreview)}
                            >
                                Revenir à la vue admin
                            </Menu.Item>
                        )}
                    </>
                )}
                <Menu.Divider />
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

/** En-tête : logo, brouillons (admin) et menu du compte. */
export const AppHeader = () => {
    const user = useCurrentUser();
    return (
        <Group h="100%" justify="space-between">
            <Anchor component={Link} to="/" underline="never" c="inherit">
                <Title order={3}>🍱 Bento</Title>
            </Anchor>
            <Group gap="sm">
                {user.role === 'admin' && <DraftsIndicator />}
                <UserMenu />
            </Group>
        </Group>
    );
};

/** Rappel de la vue lecteur d'un admin, avec retour à la vue admin. */
export const PreviewBanner = () => {
    const { preview } = useCurrentUser();
    if (!preview) return null;
    return (
        <Alert color="orange" variant="light" mb="md" py="xs">
            <Group justify="space-between">
                <Text size="sm">
                    Vue lecteur : {ageLimitLabel(preview.maxAge).toLowerCase()}.
                    Les écrans d’administration sont masqués.
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
