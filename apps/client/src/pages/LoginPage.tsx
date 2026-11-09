import { Alert, Button, PasswordInput, Text, TextInput } from '@mantine/core';
import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { safeRedirect } from '@server/types';

import { PublicFrame } from '@/components/accounts/PublicFrame';
import { login } from '@/services/api';

/** Connexion par identifiant et mot de passe (page publique). */
export const LoginPage = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
            await login(username, password);
            navigate(safeRedirect(params.get('redirect')), { replace: true });
        } catch (e) {
            setError((e as Error).message);
            setBusy(false);
        }
    };

    return (
        <PublicFrame title="Connexion">
            <form onSubmit={(event) => void submit(event)}>
                <TextInput
                    label="Identifiant"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    required
                    value={username}
                    onChange={(event) => setUsername(event.currentTarget.value)}
                    mb="sm"
                    data-autofocus
                    autoFocus
                />
                <PasswordInput
                    label="Mot de passe"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    mb="md"
                />
                {error && (
                    <Alert color="red" mb="md">
                        {error}
                    </Alert>
                )}
                <Button type="submit" fullWidth loading={busy}>
                    Se connecter
                </Button>
            </form>
            <Text size="xs" c="dimmed" ta="center">
                Mot de passe oublié ? Demande un nouveau lien à
                l’administrateur.
            </Text>
        </PublicFrame>
    );
};
