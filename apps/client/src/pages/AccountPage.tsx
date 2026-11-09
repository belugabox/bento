import {
    Alert,
    Button,
    Group,
    Paper,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { type FormEvent, type ReactNode, useState } from 'react';

import {
    NewPasswordInputs,
    UsernameInput,
} from '@/components/accounts/AccountFields';
import { AvatarPicker } from '@/components/accounts/AvatarPicker';
import {
    passwordReady,
    usernameError,
} from '@/components/accounts/accountRules';
import { randomAvatarSeed, updateMe } from '@/services/api';
import { useCurrentUser, useRefreshUser } from '@/services/auth';

/** Envoie une modification du compte, puis relit la personne connectée. */
const useSave = () => {
    const refresh = useRefreshUser();
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const save = async (
        changes: Parameters<typeof updateMe>[0],
        done: string,
    ) => {
        setBusy(true);
        setError(undefined);
        try {
            await updateMe(changes);
            await refresh();
            notifications.show({ message: done, color: 'teal' });
            return true;
        } catch (e) {
            setError((e as Error).message);
            return false;
        } finally {
            setBusy(false);
        }
    };
    return { save, error, busy };
};

const Section = ({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) => (
    <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
            <Title order={4}>{title}</Title>
            {children}
        </Stack>
    </Paper>
);

/** Compte venu de Pocket ID : identifiant et mot de passe à choisir. */
const Activation = () => {
    const user = useCurrentUser();
    const { save, error, busy } = useSave();
    const [username, setUsername] = useState(user.name.split(/\s+/)[0] ?? '');
    const [avatarSeed, setAvatarSeed] = useState(
        user.avatarSeed ?? randomAvatarSeed(),
    );
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const ready =
        passwordReady(password, confirm) &&
        username.trim() !== '' &&
        !usernameError(username);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        void save(
            { username, password, avatarSeed },
            'Compte activé : tu peux te connecter avec ton identifiant',
        );
    };

    return (
        <Section title="Active ton compte">
            <Text size="sm" c="dimmed">
                Bento n’utilise plus Pocket ID. Choisis ton identifiant et ton
                mot de passe pour pouvoir te reconnecter ; tes lectures sont
                gardées.
            </Text>
            <form onSubmit={submit}>
                <Stack gap="sm">
                    <AvatarPicker value={avatarSeed} onChange={setAvatarSeed} />
                    <UsernameInput value={username} onChange={setUsername} />
                    <NewPasswordInputs
                        password={password}
                        confirm={confirm}
                        onChange={(p, c) => {
                            setPassword(p);
                            setConfirm(c);
                        }}
                    />
                    {error && <Alert color="red">{error}</Alert>}
                    <Group>
                        <Button type="submit" disabled={!ready} loading={busy}>
                            Activer mon compte
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Section>
    );
};

const AvatarSection = () => {
    const user = useCurrentUser();
    const { save, error, busy } = useSave();
    const [seed, setSeed] = useState(user.avatarSeed ?? randomAvatarSeed());
    return (
        <Section title="Avatar">
            <AvatarPicker label={null} value={seed} onChange={setSeed} />
            {error && <Alert color="red">{error}</Alert>}
            <Group>
                <Button
                    disabled={seed === user.avatarSeed}
                    loading={busy}
                    onClick={() =>
                        void save({ avatarSeed: seed }, 'Avatar enregistré')
                    }
                >
                    Enregistrer l’avatar
                </Button>
            </Group>
        </Section>
    );
};

const IdentitySection = () => {
    const user = useCurrentUser();
    const { save, error, busy } = useSave();
    const [username, setUsername] = useState(user.name);
    const [email, setEmail] = useState(user.email ?? '');
    const changed =
        username.trim() !== user.name || email.trim() !== (user.email ?? '');

    const submit = (event: FormEvent) => {
        event.preventDefault();
        void save(
            {
                ...(username.trim() !== user.name && { username }),
                email,
            },
            'Compte enregistré',
        );
    };

    return (
        <Section title="Identifiant et e-mail">
            <form onSubmit={submit}>
                <Stack gap="sm">
                    <UsernameInput value={username} onChange={setUsername} />
                    <TextInput
                        label="E-mail"
                        description="Facultatif"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) =>
                            setEmail(event.currentTarget.value)
                        }
                    />
                    {error && <Alert color="red">{error}</Alert>}
                    <Group>
                        <Button
                            type="submit"
                            disabled={
                                !changed ||
                                !username.trim() ||
                                Boolean(usernameError(username))
                            }
                            loading={busy}
                        >
                            Enregistrer
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Section>
    );
};

const PasswordSection = () => {
    const { save, error, busy } = useSave();
    const [current, setCurrent] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const saved = await save(
            { password, currentPassword: current },
            'Mot de passe changé',
        );
        if (saved) {
            setCurrent('');
            setPassword('');
            setConfirm('');
        }
    };

    return (
        <Section title="Mot de passe">
            <form onSubmit={(event) => void submit(event)}>
                <Stack gap="sm">
                    <PasswordInput
                        label="Mot de passe actuel"
                        autoComplete="current-password"
                        required
                        value={current}
                        onChange={(event) =>
                            setCurrent(event.currentTarget.value)
                        }
                    />
                    <NewPasswordInputs
                        label="Nouveau mot de passe"
                        password={password}
                        confirm={confirm}
                        onChange={(p, c) => {
                            setPassword(p);
                            setConfirm(c);
                        }}
                    />
                    {error && <Alert color="red">{error}</Alert>}
                    <Group>
                        <Button
                            type="submit"
                            disabled={
                                !current || !passwordReady(password, confirm)
                            }
                            loading={busy}
                        >
                            Changer le mot de passe
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Section>
    );
};

/** « Mon compte » : avatar, identifiant, e-mail et mot de passe. */
export const AccountPage = () => {
    const user = useCurrentUser();
    return (
        <Stack maw={560}>
            <Title order={2}>Mon compte</Title>
            {user.hasPassword ? (
                <>
                    <AvatarSection />
                    <IdentitySection />
                    <PasswordSection />
                </>
            ) : (
                <Activation />
            )}
        </Stack>
    );
};
