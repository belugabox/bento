import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sans `globals`, Testing Library ne démonte pas les rendus entre deux tests.
afterEach(() => cleanup());

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
