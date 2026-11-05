import {
    ActionIcon,
    Alert,
    Anchor,
    Avatar,
    Button,
    Group,
    Indicator,
    Menu,
    Modal,
    Select,
    Stack,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconChartBar,
    IconEye,
    IconFolders,
    IconInbox,
    IconLogout,
    IconPalette,
    IconSettings,
    IconUsers,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';

import { AppearanceModal } from '@/components/AppearanceModal';
import { AGE_LIMITS, ageLimitLabel } from '@/components/ageLimits';
import { fetchPendingDrafts, startPreview, stopPreview } from '@/services/api';
import { logout, useCurrentUser } from '@/services/auth';

const REFRESH_MS = 60_000;
// Valeur du choix « Sans limite » (Select n'accepte pas de valeur vide).
const NO_LIMIT = 'none';

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

/** Choix de l'âge pour voir l'appli comme un lecteur (admin). */
const PreviewModal = ({
    opened,
    onClose,
}: {
    opened: boolean;
    onClose: () => void;
}) => {
    const { preview } = useCurrentUser();
    // Âge proposé : celui de la vue en cours, sinon un enfant de 10 ans.
    const [maxAge, setMaxAge] = useState<string>(
        preview ? String(preview.maxAge ?? NO_LIMIT) : '10',
    );
    return (
        <Modal opened={opened} onClose={onClose} title="Voir comme un lecteur">
            <Stack>
                <Text size="sm" c="dimmed">
                    L’appli s’affiche comme pour un lecteur de cet âge : séries
                    filtrées, écrans d’administration masqués.
                </Text>
                <Select
                    label="Séries visibles"
                    allowDeselect={false}
                    value={maxAge}
                    onChange={(value) => value && setMaxAge(value)}
                    data={AGE_LIMITS.map((limit) => ({
                        value: String(limit.value ?? NO_LIMIT),
                        label: limit.label,
                    }))}
                    comboboxProps={{ withinPortal: false }}
                />
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        onClick={() =>
                            void switchView(() =>
                                startPreview(
                                    maxAge === NO_LIMIT ? null : Number(maxAge),
                                ),
                            )
                        }
                    >
                        Voir
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

const UserMenu = () => {
    const user = useCurrentUser();
    const isAdmin = user.role === 'admin';
    const [previewOpened, previewModal] = useDisclosure(false);
    const [appearanceOpened, appearanceModal] = useDisclosure(false);
    return (
        <>
            <PreviewModal opened={previewOpened} onClose={previewModal.close} />
            <AppearanceModal
                opened={appearanceOpened}
                onClose={appearanceModal.close}
            />
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
                            to="/stats"
                            leftSection={<IconChartBar size={14} />}
                        >
                            Statistiques
                        </Menu.Item>
                    )}
                    {isAdmin && (
                        <Menu.Item
                            component={Link}
                            to="/users"
                            leftSection={<IconUsers size={14} />}
                        >
                            Comptes et contrôle parental
                        </Menu.Item>
                    )}
                    {isAdmin && (
                        <Menu.Item
                            component={Link}
                            to="/collections"
                            leftSection={<IconFolders size={14} />}
                        >
                            Collections
                        </Menu.Item>
                    )}
                    {isAdmin && (
                        <Menu.Item
                            component={Link}
                            to="/settings"
                            leftSection={<IconSettings size={14} />}
                        >
                            Réglages
                        </Menu.Item>
                    )}
                    {(isAdmin || user.preview) && (
                        <>
                            <Menu.Divider />
                            <Menu.Item
                                leftSection={<IconEye size={14} />}
                                onClick={previewModal.open}
                            >
                                Voir comme un lecteur…
                            </Menu.Item>
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
                        leftSection={<IconPalette size={14} />}
                        onClick={appearanceModal.open}
                    >
                        Apparence…
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                        leftSection={<IconLogout size={14} />}
                        onClick={() => void logout()}
                    >
                        Se déconnecter
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </>
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
