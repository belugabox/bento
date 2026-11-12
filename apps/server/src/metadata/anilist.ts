import { badGateway, refused } from '../tools/errors';

// AniList : base de mangas à l'API publique (GraphQL), sans contrôle
// anti-robot ; on n'y prend que des bannières, à la demande de l'admin.
const API_URL = 'https://graphql.anilist.co';
const USER_AGENT = 'bento/1.0 (https://github.com/belugabox/bento)';
const TIMEOUT_MS = 15_000;
const MAX_RESULTS = 5;

/** Un manga d'AniList qui a une bannière. */
export type AniListBanner = {
    id: number;
    title: string;
    bannerUrl: string;
    /** Couleur de la couverture, d'après AniList (« #e4505d »). */
    color: string | null;
};

const QUERY = `query ($search: String, $perPage: Int) {
  Page(perPage: $perPage) {
    media(search: $search, type: MANGA) {
      id
      title { romaji english }
      bannerImage
      coverImage { color }
    }
  }
}`;

type Media = {
    id: number;
    title: { romaji: string | null; english: string | null };
    bannerImage: string | null;
    coverImage: { color: string | null } | null;
};

/** Mangas trouvés, avec leur bannière (ceux qui n'en ont pas sont laissés). */
export const parseBanners = (json: unknown): AniListBanner[] => {
    const media =
        (json as { data?: { Page?: { media?: Media[] } } }).data?.Page?.media ??
        [];
    return media.flatMap((m) =>
        m.bannerImage
            ? [
                  {
                      id: m.id,
                      title: m.title.english ?? m.title.romaji ?? '',
                      bannerUrl: m.bannerImage,
                      color: m.coverImage?.color ?? null,
                  },
              ]
            : [],
    );
};

export class AniList {
    constructor(private readonly fetchFn: typeof fetch = fetch) {}

    /** Bannières des mangas dont le nom ressemble à `text`. */
    banners = async (text: string): Promise<AniListBanner[]> => {
        let response: Response;
        try {
            response = await this.fetchFn(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'User-Agent': USER_AGENT,
                },
                body: JSON.stringify({
                    query: QUERY,
                    variables: { search: text, perPage: MAX_RESULTS },
                }),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } catch (error) {
            const reason =
                error instanceof Error ? error.message : String(error);
            throw badGateway(`AniList injoignable : ${reason}`);
        }
        // Trop de requêtes : on n'insiste pas.
        if (response.status === 429) {
            throw refused('AniList limite les requêtes : réessaie plus tard');
        }
        if (!response.ok) {
            throw badGateway(`AniList indisponible (${response.status})`);
        }
        return parseBanners(await response.json());
    };
}
