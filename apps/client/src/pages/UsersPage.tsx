import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Group,
    Loader,
    Menu,
    Modal,
    SegmentedControl,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import {
    IconDots,
    IconKey,
    IconLink,
    IconTrash,
    IconUserPlus,
} from '@tabler/icons-react';
import { useState } from 'react';

import { ShareLink } from '@/components/accounts/ShareLink';
import { UserAvatar } from '@/components/accounts/UserAvatar';
import { usernameError } from '@/components/accounts/accountRules';
import {
    ACTIVATE_MESSAGE,
    INVITE_MESSAGE,
    RESET_MESSAGE,
} from '@/components/accounts/links';
import {
    ageLimitLabel,
    ageLimitOptions,
    useAgeSteps,
} from '@/components/ageLimits';
import {
    type Account,
    createInvitation,
    createUserLink,
    deleteInvitation,
    deleteUser,
    fetchInvitations,
    fetchUsers,
    joinUrl,
    updateUser,
} from '@/services/api';
import { useCurrentUser } from '@/services/auth';
import { useQuery } from '@/services/useQuery';

// Valeur du choix « Sans limite » (Select n'accepte pas de valeur vide).
const NO_LIMIT = 'none';

type Role = 'admin' | 'reader';

const ROLE_OPTIONS = [
    { value: 'reader', label: 'Lecteur' },
    { value: 'admin', label: 'Admin' },
];

/** Choix de l'âge maximal (contrôle parental). */
const AgeSelect = ({
    value,
    onChange,
    label,
    ...props
}: {
    value: number | null;
    onChange: (maxAge: number | null) => void;
    label?: string;
    'aria-label'?: string;
}) => {
    const ages = useAgeSteps();
    return (
        <Select
            size="xs"
            w={200}
            label={label}
            allowDeselect={false}
            aria-label={props['aria-label']}
            value={String(value ?? NO_LIMIT)}
            onChange={(next) =>
                onChange(
                    next === NO_LIMIT || next === null ? null : Number(next),
                )
            }
            data={ageLimitOptions(ages, value).map((limit) => ({
                value: String(limit.value ?? NO_LIMIT),
                label: limit.label,
            }))}
        />
    );
};

/** Lien à envoyer : invitation, activation ou nouveau mot de passe. */
type SharedLink = { title: string; url: string; message: string };

/**
 * Nouvelle invitation : rôle, âge maximal et peut-être l'identifiant, puis le
 * lien à envoyer.
 */
const InviteModal = ({
    opened,
    onClose,
    onCreated,
}: {
    opened: boolean;
    onClose: () => void;
    onCreated: (link: SharedLink) => void;
}) => {
    const [role, setRole] = useState<Role>('reader');
    const [maxAge, setMaxAge] = useState<number | null>(null);
    const [username, setUsername] = useState('');
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);

    const create = async () => {
        setBusy(true);
        setError(undefined);
        try {
            const { token } = await createInvitation({
                role,
                maxAge,
                username: username.trim() || null,
            });
            setUsername('');
            onCreated({
                title: 'Invitation prête',
                url: joinUrl(token),
                message: INVITE_MESSAGE,
            });
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} title="Inviter quelqu’un">
            <Stack>
                <Text size="sm" c="dimmed">
                    La personne choisira son mot de passe et son avatar, et
                    pourra changer l’identifiant proposé.
                </Text>
                <TextInput
                    label="Identifiant"
                    description="Facultatif : déjà rempli sur sa page d’inscription"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={username}
                    error={
                        username.trim() ? usernameError(username) : undefined
                    }
                    onChange={(event) => setUsername(event.currentTarget.value)}
                />
                <SegmentedControl
                    value={role}
                    onChange={(value) => setRole(value as Role)}
                    data={ROLE_OPTIONS}
                    aria-label="Rôle"
                />
                {role === 'reader' && (
                    <AgeSelect
                        label="Séries visibles"
                        value={maxAge}
                        onChange={setMaxAge}
                    />
                )}
                {error && <Alert color="red">{error}</Alert>}
                <Group justify="flex-end">
                    <Button
                        leftSection={<IconLink size={16} />}
                        loading={busy}
                        disabled={Boolean(
                            username.trim() && usernameError(username),
                        )}
                        onClick={() => void create()}
                    >
                        Créer le lien
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

const formatDate = (value: string) =>
    new Date(value).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
    });

/** Comptes, invitations et contrôle parental (admin). */
export const UsersPage = () => {
    const me = useCurrentUser();
    const { data: users, error, reload } = useQuery(fetchUsers, []);
    const invitations = useQuery(fetchInvitations, []);
    const [actionError, setActionError] = useState<string>();
    const [inviting, setInviting] = useState(false);
    const [shared, setShared] = useState<SharedLink>();
    const [deleting, setDeleting] = useState<Account>();

    const run = async (action: () => Promise<unknown>) => {
        setActionError(undefined);
        try {
            await action();
            reload();
            invitations.reload();
        } catch (e) {
            setActionError((e as Error).message);
        }
    };

    const sendLink = (user: Account) =>
        run(async () => {
            const { token } = await createUserLink(user.id);
            setShared({
                title: user.hasPassword
                    ? `Nouveau mot de passe pour ${user.name}`
                    : `Activation du compte de ${user.name}`,
                url: joinUrl(token),
                message: user.hasPassword ? RESET_MESSAGE : ACTIVATE_MESSAGE,
            });
        });

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!users) return <Loader mx="auto" />;

    return (
        <Stack>
            <Group justify="space-between">
                <Title order={2}>Comptes</Title>
                <Button
                    leftSection={<IconUserPlus size={16} />}
                    onClick={() => setInviting(true)}
                >
                    Inviter
                </Button>
            </Group>
            <Text size="sm" c="dimmed">
                Un compte limité ne voit que les séries dont la classification
                est sous sa limite ; les séries sans classification lui sont
                masquées. Les administrateurs voient tout.
            </Text>
            {actionError && <Alert color="red">{actionError}</Alert>}
            <Table.ScrollContainer minWidth={560}>
                <Table verticalSpacing="sm">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Personne</Table.Th>
                            <Table.Th>Rôle</Table.Th>
                            <Table.Th>Séries visibles</Table.Th>
                            <Table.Th w={40} />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {users.map((user) => {
                            const self = user.id === me.id;
                            return (
                                <Table.Tr key={user.id}>
                                    <Table.Td>
                                        <Group gap="sm" wrap="nowrap">
                                            <UserAvatar
                                                name={user.name}
                                                seed={user.avatarSeed}
                                                radius="xl"
                                            />
                                            <div>
                                                <Group gap={6}>
                                                    <Text size="sm" fw={500}>
                                                        {user.name}
                                                    </Text>
                                                    {!user.hasPassword && (
                                                        <Badge
                                                            size="xs"
                                                            color="orange"
                                                            variant="light"
                                                        >
                                                            À activer
                                                        </Badge>
                                                    )}
                                                </Group>
                                                {user.email && (
                                                    <Text size="xs" c="dimmed">
                                                        {user.email}
                                                    </Text>
                                                )}
                                            </div>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>
                                        <Select
                                            size="xs"
                                            w={110}
                                            allowDeselect={false}
                                            disabled={self}
                                            aria-label={`Rôle de ${user.name}`}
                                            value={user.role}
                                            data={ROLE_OPTIONS}
                                            onChange={(role) =>
                                                void run(() =>
                                                    updateUser(user.id, {
                                                        role: role as Role,
                                                    }),
                                                )
                                            }
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        {user.role === 'admin' ? (
                                            <Text size="sm" c="dimmed">
                                                Toutes
                                            </Text>
                                        ) : (
                                            <AgeSelect
                                                aria-label={`Âge maximal de ${user.name}`}
                                                value={user.maxAge}
                                                onChange={(maxAge) =>
                                                    void run(() =>
                                                        updateUser(user.id, {
                                                            maxAge,
                                                        }),
                                                    )
                                                }
                                            />
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                        <Menu position="bottom-end">
                                            <Menu.Target>
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="gray"
                                                    aria-label={`Actions pour ${user.name}`}
                                                >
                                                    <IconDots size={16} />
                                                </ActionIcon>
                                            </Menu.Target>
                                            <Menu.Dropdown>
                                                <Menu.Item
                                                    leftSection={
                                                        user.hasPassword ? (
                                                            <IconKey
                                                                size={14}
                                                            />
                                                        ) : (
                                                            <IconLink
                                                                size={14}
                                                            />
                                                        )
                                                    }
                                                    onClick={() =>
                                                        void sendLink(user)
                                                    }
                                                >
                                                    {user.hasPassword
                                                        ? 'Lien de nouveau mot de passe'
                                                        : 'Lien d’activation'}
                                                </Menu.Item>
                                                <Menu.Item
                                                    color="red"
                                                    disabled={self}
                                                    leftSection={
                                                        <IconTrash size={14} />
                                                    }
                                                    onClick={() =>
                                                        setDeleting(user)
                                                    }
                                                >
                                                    Supprimer…
                                                </Menu.Item>
                                            </Menu.Dropdown>
                                        </Menu>
                                    </Table.Td>
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>

            {invitations.data && invitations.data.length > 0 && (
                <Stack gap="xs">
                    <Title order={4}>Invitations en attente</Title>
                    {invitations.data.map((invitation) => (
                        <Group key={invitation.id} justify="space-between">
                            <Text size="sm">
                                {invitation.username && (
                                    <Text span fw={600}>
                                        {invitation.username} ·{' '}
                                    </Text>
                                )}
                                {invitation.role === 'admin'
                                    ? 'Admin'
                                    : `Lecteur · ${ageLimitLabel(invitation.maxAge).toLowerCase()}`}
                                <Text span size="xs" c="dimmed">
                                    {' '}
                                    · valable jusqu’au{' '}
                                    {formatDate(invitation.expiresAt)}
                                </Text>
                            </Text>
                            <Button
                                size="compact-sm"
                                variant="subtle"
                                color="red"
                                onClick={() =>
                                    void run(() =>
                                        deleteInvitation(invitation.id),
                                    )
                                }
                            >
                                Annuler
                            </Button>
                        </Group>
                    ))}
                </Stack>
            )}

            <InviteModal
                opened={inviting}
                onClose={() => setInviting(false)}
                onCreated={(link) => {
                    setInviting(false);
                    setShared(link);
                    invitations.reload();
                }}
            />
            <Modal
                opened={shared !== undefined}
                onClose={() => setShared(undefined)}
                title={shared?.title}
            >
                {shared && (
                    <ShareLink url={shared.url} message={shared.message} />
                )}
            </Modal>
            <Modal
                opened={deleting !== undefined}
                onClose={() => setDeleting(undefined)}
                title="Supprimer le compte"
            >
                <Stack>
                    <Text size="sm">
                        Supprimer le compte de <b>{deleting?.name}</b> ? Ses
                        lectures et sa liste « À lire » seront effacées.
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setDeleting(undefined)}
                        >
                            Garder
                        </Button>
                        <Button
                            color="red"
                            onClick={() => {
                                const user = deleting!;
                                setDeleting(undefined);
                                void run(() => deleteUser(user.id));
                            }}
                        >
                            Supprimer
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
};
