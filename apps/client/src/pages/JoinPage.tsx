import { Alert, Button, Loader, Stack, Text, TextInput } from '@mantine/core';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import {
    NewPasswordInputs,
    UsernameInput,
} from '@/components/accounts/AccountFields';
import { AvatarPicker } from '@/components/accounts/AvatarPicker';
import { PublicFrame } from '@/components/accounts/PublicFrame';
import {
    passwordReady,
    usernameError,
} from '@/components/accounts/accountRules';
import { fetchLink, randomAvatarSeed, submitLink } from '@/services/api';
import { useQuery } from '@/services/useQuery';

const TITLES = {
    invite: 'Bienvenue !',
    activate: 'Active ton compte',
    reset: 'Nouveau mot de passe',
};

const SUBMIT = {
    invite: 'Créer mon compte',
    activate: 'Activer mon compte',
    reset: 'Enregistrer',
};

/**
 * Page d'un lien envoyé par l'admin (publique) : création du compte,
 * activation d'un compte venu de Pocket ID, ou nouveau mot de passe.
 */
export const JoinPage = () => {
    const { token = '' } = useParams();
    const navigate = useNavigate();
    const { data: link, error } = useQuery(() => fetchLink(token), [token]);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [avatarSeed, setAvatarSeed] = useState(randomAvatarSeed);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saveError, setSaveError] = useState<string>();
    const [busy, setBusy] = useState(false);

    // Compte existant : identifiant proposé, e-mail et avatar actuels.
    useEffect(() => {
        if (!link) return;
        setUsername(link.username ?? '');
        setEmail(link.email ?? '');
        if (link.avatarSeed) setAvatarSeed(link.avatarSeed);
    }, [link]);

    if (error) {
        return (
            <PublicFrame title="Lien expiré">
                <Alert color="orange">{error.message}</Alert>
                <Button component={Link} to="/login" variant="light">
                    Se connecter
                </Button>
            </PublicFrame>
        );
    }
    if (!link) {
        return (
            <PublicFrame title="Bento">
                <Loader mx="auto" />
            </PublicFrame>
        );
    }

    const full = link.kind !== 'reset';
    const ready =
        passwordReady(password, confirm) &&
        (!full || (username.trim() !== '' && !usernameError(username)));

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setSaveError(undefined);
        try {
            await submitLink(
                token,
                full ? { username, password, email, avatarSeed } : { password },
            );
            navigate('/', { replace: true });
        } catch (e) {
            setSaveError((e as Error).message);
            setBusy(false);
        }
    };

    return (
        <PublicFrame title={TITLES[link.kind]}>
            {link.kind === 'invite' && (
                <Text size="sm" c="dimmed">
                    Choisis ton avatar, ton identifiant et ton mot de passe.
                </Text>
            )}
            {link.kind === 'activate' && (
                <Text size="sm" c="dimmed">
                    Bento n’utilise plus Pocket ID. Choisis ton identifiant et
                    ton mot de passe : tes lectures sont gardées.
                </Text>
            )}
            {link.kind === 'reset' && (
                <Text size="sm" c="dimmed">
                    Pour le compte <b>{link.username}</b>.
                </Text>
            )}
            <form onSubmit={(event) => void submit(event)}>
                <Stack gap="sm">
                    {full && (
                        <>
                            <AvatarPicker
                                value={avatarSeed}
                                onChange={setAvatarSeed}
                            />
                            <UsernameInput
                                value={username}
                                onChange={setUsername}
                            />
                        </>
                    )}
                    <NewPasswordInputs
                        password={password}
                        confirm={confirm}
                        onChange={(p, c) => {
                            setPassword(p);
                            setConfirm(c);
                        }}
                    />
                    {full && (
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
                    )}
                    {saveError && <Alert color="red">{saveError}</Alert>}
                    <Button
                        type="submit"
                        fullWidth
                        disabled={!ready}
                        loading={busy}
                        mt="xs"
                    >
                        {SUBMIT[link.kind]}
                    </Button>
                </Stack>
            </form>
        </PublicFrame>
    );
};
