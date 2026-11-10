import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { clearQueryCache } from '@/services/useQuery';

// Sans `globals`, Testing Library ne démonte pas les rendus entre deux tests.
// Les réponses gardées en mémoire ne passent pas d'un test à l'autre.
afterEach(() => {
    cleanup();
    clearQueryCache();
});

// API du navigateur absentes de jsdom, utilisées par Mantine.
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    }),
});

class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
window.ResizeObserver = ResizeObserver;

// Utilisé par les listes déroulantes de Mantine.
Element.prototype.scrollIntoView = () => {};
