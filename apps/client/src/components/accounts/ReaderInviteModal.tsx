import {
    Alert,
    Button,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconLink } from '@tabler/icons-react';
import { useState } from 'react';

import { PageLoader } from '@/components/PageLoader';
import { ShareLink } from '@/components/accounts/ShareLink';
import { UserAvatar } from '@/components/accounts/UserAvatar';
import { usernameError } from '@/components/accounts/accountRules';
import { INVITE_MESSAGE } from '@/components/accounts/links';
import {
    createMyInvitation,
    deleteMyInvitation,
    fetchMyInvitations,
    joinUrl,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

const formatDate = (value: string) =>
    new Date(value).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
    });

/**
 * « Inviter quelqu'un » d'un lecteur (Moi) : un lien comme celui de l'admin,
 * mais le compte créé attend la validation de l'admin. Ses invitations en
 * cours et les comptes qui attendent, dessous.
 */
export const ReaderInviteModal = ({
    opened,
    onClose,
}: {
    opened: boolean;
    onClose: () => void;
}) => (
    <Modal opened={opened} onClose={onClose} title="Inviter quelqu’un">
        {/* Relu à chaque ouverture. */}
        {opened && <ReaderInvites />}
    </Modal>
);

const ReaderInvites = () => {
    const invites = useQuery(fetchMyInvitations, []);
    const [username, setUsername] = useState('');
    const [url, setUrl] = useState<string>();
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError(undefined);
        try {
            await action();
            invites.reload();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    if (invites.error) {
        return <Alert color="red">{invites.error.message}</Alert>;
    }
    if (!invites.data) return <PageLoader />;
    const { links, pending, max } = invites.data;
    const full = links.length + pending.length >= max;

    return (
        <Stack>
            {url ? (
                <ShareLink url={url} message={INVITE_MESSAGE} />
            ) : (
                <>
                    <Text size="sm" c="dimmed">
                        La personne choisira son identifiant, son mot de passe
                        et son avatar. Son compte sera utilisable une fois
                        validé par l’admin.
                    </Text>
                    <TextInput
                        label="Identifiant"
                        description="Facultatif : déjà rempli sur sa page d’inscription"
                        autoCapitalize="none"
                        autoCorrect="off"
                        value={username}
                        disabled={full}
                        error={
                            username.trim()
                                ? usernameError(username)
                                : undefined
                        }
                        onChange={(event) =>
                            setUsername(event.currentTarget.value)
                        }
                    />
                    {full && (
                        <Text size="sm" c="orange">
                            {max} invitations au plus en attente : annule-en
                            une, ou attends que l’admin valide les comptes.
                        </Text>
                    )}
                    <Group justify="flex-end">
                        <Button
                            leftSection={<IconLink size={16} />}
                            loading={busy}
                            disabled={
                                full ||
                                Boolean(
                                    username.trim() && usernameError(username),
                                )
                            }
                            onClick={() =>
                                void run(async () => {
                                    const { token } = await createMyInvitation(
                                        username.trim() || null,
                                    );
                                    setUsername('');
                                    setUrl(joinUrl(token));
                                })
                            }
                        >
                            Créer le lien
                        </Button>
                    </Group>
                </>
            )}
            {error && <Alert color="red">{error}</Alert>}
            {(links.length > 0 || pending.length > 0) && (
                <Stack gap="xs">
                    <Text size="sm" fw={600}>
                        En attente
                    </Text>
                    {links.map((link) => (
                        <Group key={link.id} justify="space-between">
                            <Text size="sm">
                                {link.username ? `${link.username} · ` : ''}
                                <Text span size="xs" c="dimmed">
                                    lien valable jusqu’au{' '}
                                    {formatDate(link.expiresAt)}
                                </Text>
                            </Text>
                            <Button
                                size="compact-sm"
                                variant="subtle"
                                color="red"
                                disabled={busy}
                                onClick={() =>
                                    void run(() =>
                                        deleteMyInvitation(link.id).then(
                                            () => undefined,
                                        ),
                                    )
                                }
                            >
                                Annuler
                            </Button>
                        </Group>
                    ))}
                    {pending.map((account) => (
                        <Group key={account.id} gap="sm" wrap="nowrap">
                            <UserAvatar
                                name={account.name}
                                seed={account.avatarSeed}
                                radius="xl"
                                size="sm"
                            />
                            <Text size="sm">
                                {account.name}{' '}
                                <Text span size="xs" c="dimmed">
                                    · compte créé, attend l’admin
                                </Text>
                            </Text>
                        </Group>
                    ))}
                </Stack>
            )}
        </Stack>
    );
};
