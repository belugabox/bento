import { PasswordInput, TextInput } from '@mantine/core';

import { PASSWORD_MIN_LENGTH } from '@server/types';

import { passwordError, usernameError } from './accountRules';

export const UsernameInput = ({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) => (
    <TextInput
        label="Identifiant"
        description="Pour te connecter"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        required
        value={value}
        error={usernameError(value)}
        onChange={(event) => onChange(event.currentTarget.value)}
    />
);

/** Nouveau mot de passe, tapé deux fois. */
export const NewPasswordInputs = ({
    password,
    confirm,
    onChange,
    label = 'Mot de passe',
}: {
    password: string;
    confirm: string;
    onChange: (password: string, confirm: string) => void;
    label?: string;
}) => (
    <>
        <PasswordInput
            label={label}
            description={`${PASSWORD_MIN_LENGTH} caractères au moins`}
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => onChange(event.currentTarget.value, confirm)}
        />
        <PasswordInput
            label="Encore une fois"
            autoComplete="new-password"
            required
            value={confirm}
            error={passwordError(password, confirm)}
            onChange={(event) => onChange(password, event.currentTarget.value)}
        />
    </>
);
