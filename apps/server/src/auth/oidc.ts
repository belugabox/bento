import { createHash, randomBytes } from 'node:crypto';

import { badGateway } from '../tools/errors';

export type OidcConfig = {
    issuer: string;
    clientId: string;
    clientSecret: string;
    // Adresse de retour déclarée chez le fournisseur.
    redirectUri: string;
};

type Discovery = {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    end_session_endpoint?: string;
};

export type OidcUser = {
    sub: string;
    name: string;
    email?: string;
    groups: string[];
};

const SCOPES = 'openid profile email groups';
// Délai d'une requête vers Pocket ID, pour ne pas bloquer la connexion.
const TIMEOUT_MS = 10_000;

/** Chaîne aléatoire URL-safe (state, code_verifier, jetons de session). */
export const randomToken = (bytes = 32) =>
    randomBytes(bytes).toString('base64url');

/** Défi PKCE (S256) d'un code_verifier. */
export const codeChallenge = (verifier: string) =>
    createHash('sha256').update(verifier).digest('base64url');

/**
 * Client OIDC minimal (flux « authorization code » avec PKCE, client
 * confidentiel). Les informations de la personne viennent de l'adresse
 * userinfo, appelée directement par le serveur en HTTPS : l'id_token n'a
 * pas besoin d'être vérifié (OpenID Connect Core, 3.1.3.7).
 */
export class OidcClient {
    private discovery?: Promise<Discovery>;

    constructor(
        private readonly config: OidcConfig,
        private readonly fetchFn: typeof fetch = fetch,
    ) {}

    private discover = (): Promise<Discovery> => {
        this.discovery ??= (async () => {
            const url = `${this.config.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
            const response = await this.fetchFn(url, {
                signal: AbortSignal.timeout(TIMEOUT_MS),
            }).catch(() => undefined);
            if (!response?.ok) {
                throw badGateway('Pocket ID est injoignable');
            }
            const discovery = (await response.json()) as Discovery;
            if (
                discovery.issuer.replace(/\/+$/, '') !==
                this.config.issuer.replace(/\/+$/, '')
            ) {
                throw badGateway('Pocket ID : émetteur inattendu');
            }
            return discovery;
        })().catch((error) => {
            // Réessayer à la prochaine connexion.
            this.discovery = undefined;
            throw error;
        });
        return this.discovery;
    };

    /** Adresse de la page de connexion du fournisseur. */
    authorizationUrl = async ({
        state,
        verifier,
    }: {
        state: string;
        verifier: string;
    }) => {
        const { authorization_endpoint } = await this.discover();
        const url = new URL(authorization_endpoint);
        url.search = new URLSearchParams({
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            scope: SCOPES,
            state,
            code_challenge: codeChallenge(verifier),
            code_challenge_method: 'S256',
        }).toString();
        return url.toString();
    };

    /** Échange le code contre un jeton, puis lit l'identité de la personne. */
    userFromCode = async (
        code: string,
        verifier: string,
    ): Promise<OidcUser> => {
        const { token_endpoint, userinfo_endpoint } = await this.discover();
        const credentials = Buffer.from(
            `${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`,
        ).toString('base64');
        const tokenResponse = await this.fetchFn(token_endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.config.redirectUri,
                code_verifier: verifier,
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        }).catch(() => undefined);
        if (!tokenResponse?.ok) {
            throw badGateway('Pocket ID a refusé la connexion');
        }
        const { access_token } = (await tokenResponse.json()) as {
            access_token?: string;
        };
        if (!access_token) throw badGateway('Pocket ID : jeton absent');

        const infoResponse = await this.fetchFn(userinfo_endpoint, {
            headers: { Authorization: `Bearer ${access_token}` },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        }).catch(() => undefined);
        if (!infoResponse?.ok) {
            throw badGateway('Pocket ID : identité illisible');
        }
        const info = (await infoResponse.json()) as Record<string, unknown>;
        if (typeof info.sub !== 'string' || !info.sub) {
            throw badGateway('Pocket ID : identifiant absent');
        }
        const text = (value: unknown) =>
            typeof value === 'string' && value.trim()
                ? value.trim()
                : undefined;
        return {
            sub: info.sub,
            name:
                text(info.name) ??
                text(info.display_name) ??
                text(info.preferred_username) ??
                text(info.email) ??
                info.sub,
            email: text(info.email),
            groups: Array.isArray(info.groups)
                ? info.groups.filter((g): g is string => typeof g === 'string')
                : [],
        };
    };

    /** Adresse de déconnexion chez le fournisseur, s'il en propose une. */
    logoutUrl = async (postLogoutRedirectUri: string) => {
        const { end_session_endpoint } = await this.discover();
        if (!end_session_endpoint) return undefined;
        const url = new URL(end_session_endpoint);
        url.search = new URLSearchParams({
            client_id: this.config.clientId,
            post_logout_redirect_uri: postLogoutRedirectUri,
        }).toString();
        return url.toString();
    };
}
