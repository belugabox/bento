import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt (inclus dans Node) : N = 2^15, r = 8, p = 1, soit 32 Mo et
// environ 50 ms par essai.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MAX_MEMORY = 64 * 1024 * 1024;

const derive = (
    password: string,
    salt: Buffer,
    { n, r, p }: { n: number; r: number; p: number },
) =>
    new Promise<Buffer>((resolve, reject) =>
        scrypt(
            password.normalize('NFC'),
            salt,
            KEY_LENGTH,
            { N: n, r, p, maxmem: MAX_MEMORY },
            (err, key) => (err ? reject(err) : resolve(key)),
        ),
    );

/** Empreinte à garder en base : « scrypt$N$r$p$sel$clé » (base64url). */
export const hashPassword = async (password: string) => {
    const salt = randomBytes(16);
    const key = await derive(password, salt, { n: N, r: R, p: P });
    return [
        'scrypt',
        N,
        R,
        P,
        salt.toString('base64url'),
        key.toString('base64url'),
    ].join('$');
};

/** Vrai si le mot de passe correspond à l'empreinte. */
export const verifyPassword = async (password: string, stored: string) => {
    const [kind, n, r, p, salt, key] = stored.split('$');
    if (kind !== 'scrypt' || !salt || !key) return false;
    const expected = Buffer.from(key, 'base64url');
    const actual = await derive(password, Buffer.from(salt, 'base64url'), {
        n: Number(n),
        r: Number(r),
        p: Number(p),
    });
    return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
    );
};

// Empreinte d'un mot de passe inconnu : une connexion avec un identifiant
// qui n'existe pas prend le même temps qu'avec un mauvais mot de passe.
let decoy: Promise<string> | undefined;
export const decoyHash = () =>
    (decoy ??= hashPassword(randomBytes(16).toString('hex')));
