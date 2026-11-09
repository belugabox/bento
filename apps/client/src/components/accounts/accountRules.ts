import {
    PASSWORD_MIN_LENGTH,
    USERNAME_PATTERN,
    USERNAME_RULE,
} from '@server/types';

/** Erreur de l'identifiant tapé, ou `undefined`. */
export const usernameError = (value: string) =>
    !value.trim() || USERNAME_PATTERN.test(value.trim())
        ? undefined
        : USERNAME_RULE;

/** Erreur du nouveau mot de passe et de sa confirmation, ou `undefined`. */
export const passwordError = (password: string, confirm: string) =>
    password.length > 0 && password.length < PASSWORD_MIN_LENGTH
        ? `${PASSWORD_MIN_LENGTH} caractères au moins`
        : confirm && confirm !== password
          ? 'Les deux mots de passe ne sont pas les mêmes'
          : undefined;

/** Les champs sont-ils prêts à être envoyés ? */
export const passwordReady = (password: string, confirm: string) =>
    password.length >= PASSWORD_MIN_LENGTH && password === confirm;
