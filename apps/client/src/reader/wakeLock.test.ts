import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WAKE_IDLE_MS, useWakeLock } from './wakeLock';

/** Verrou factice : `release` le libère et prévient comme le navigateur. */
const fakeLock = () => {
    const listeners: (() => void)[] = [];
    const lock = {
        released: false,
        release: vi.fn(async () => {
            lock.released = true;
            for (const listener of listeners) listener();
        }),
        addEventListener: (_: string, listener: () => void) =>
            listeners.push(listener),
    };
    return lock;
};

let locks: ReturnType<typeof fakeLock>[];
let request: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.useFakeTimers();
    locks = [];
    request = vi.fn(async () => {
        const lock = fakeLock();
        locks.push(lock);
        return lock;
    });
    Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request },
    });
});

afterEach(() => {
    vi.useRealTimers();
    delete (navigator as { wakeLock?: unknown }).wakeLock;
});

describe('screen wake lock', () => {
    it('keeps the screen on while reading, then lets it sleep after a while', async () => {
        const { unmount } = renderHook(() => useWakeLock());
        await act(async () => {});
        expect(request).toHaveBeenCalledWith('screen');
        expect(locks).toHaveLength(1);

        // Une page tournée : le délai repart, sans nouvelle demande.
        await act(async () => {
            vi.advanceTimersByTime(WAKE_IDLE_MS - 1000);
            window.dispatchEvent(new Event('pointerdown'));
        });
        expect(request).toHaveBeenCalledTimes(1);
        await act(async () => {
            vi.advanceTimersByTime(WAKE_IDLE_MS - 1000);
        });
        expect(locks[0]!.released).toBe(false);

        // Plus rien : l'écran peut s'éteindre.
        await act(async () => {
            vi.advanceTimersByTime(2000);
        });
        expect(locks[0]!.released).toBe(true);

        // On reprend la lecture : de nouveau allumé.
        await act(async () => {
            window.dispatchEvent(new Event('keydown'));
        });
        expect(locks).toHaveLength(2);

        // En quittant le lecteur : rendu.
        unmount();
        expect(locks[1]!.released).toBe(true);
    });

    it('asks again when the tab comes back', async () => {
        renderHook(() => useWakeLock());
        await act(async () => {});
        // Onglet caché : le navigateur libère le verrou.
        await act(async () => {
            await locks[0]!.release();
        });
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(locks).toHaveLength(2);
    });

    it('does nothing without browser support', () => {
        delete (navigator as { wakeLock?: unknown }).wakeLock;
        expect(() => renderHook(() => useWakeLock())).not.toThrow();
    });
});
