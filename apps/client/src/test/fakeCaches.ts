/**
 * Cache du navigateur (`caches`), absent de jsdom : juste ce qu'utilisent
 * les téléchargements (open, put, match avec `ignoreSearch`, keys, delete).
 */
class FakeCache {
    private entries = new Map<string, { body: ArrayBuffer; type: string }>();

    private static url = (request: RequestInfo | URL) =>
        new URL(
            typeof request === 'string' || request instanceof URL
                ? String(request)
                : request.url,
            window.location.origin,
        );

    put = async (request: RequestInfo | URL, response: Response) => {
        this.entries.set(FakeCache.url(request).href, {
            body: await response.arrayBuffer(),
            type: response.headers.get('Content-Type') ?? '',
        });
    };

    match = async (
        request: RequestInfo | URL,
        options?: { ignoreSearch?: boolean },
    ) => {
        const url = FakeCache.url(request);
        const found = [...this.entries.entries()].find(([key]) => {
            const stored = new URL(key);
            return options?.ignoreSearch
                ? stored.origin + stored.pathname === url.origin + url.pathname
                : key === url.href;
        });
        return found
            ? new Response(found[1].body.slice(0), {
                  headers: { 'Content-Type': found[1].type },
              })
            : undefined;
    };

    keys = async () => [...this.entries.keys()].map((key) => new Request(key));

    delete = async (request: RequestInfo | URL) =>
        this.entries.delete(FakeCache.url(request).href);
}

/** Installe un `caches` vide ; à appeler avant chaque test. */
export const installFakeCaches = () => {
    const stores = new Map<string, FakeCache>();
    Object.defineProperty(globalThis, 'caches', {
        configurable: true,
        value: {
            open: async (name: string) => {
                if (!stores.has(name)) stores.set(name, new FakeCache());
                return stores.get(name)!;
            },
            delete: async (name: string) => stores.delete(name),
        },
    });
    return stores;
};

/** Retire le faux `caches`. */
export const removeFakeCaches = () => {
    delete (globalThis as { caches?: unknown }).caches;
};
