// Tests : les réponses JSON de l'API sont lues sans typage précis.
declare global {
    interface Response {
        json<T = any>(): Promise<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
}

export {};
