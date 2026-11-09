import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendReadingTime } from '@/services/api';

import { useReadingTime } from './readingTime';

vi.mock('@/services/api', () => ({
    sendReadingTime: vi.fn(() => Promise.resolve({ ok: true })),
}));

const sent = () => vi.mocked(sendReadingTime).mock.calls;

beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(sendReadingTime).mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useReadingTime', () => {
    it('counts the time between pages, sent every minute and on leaving', () => {
        const { result, unmount } = renderHook(() => useReadingTime(5, true));

        result.current(1);
        vi.advanceTimersByTime(30_000);
        result.current(1);
        // Envoi de la minute : 30 s, 2 pages.
        vi.advanceTimersByTime(30_000);
        expect(sent()).toEqual([[5, { seconds: 30, pages: 2 }]]);

        // Le temps continue après l'envoi, et la dernière page compte en
        // quittant.
        result.current(1);
        vi.advanceTimersByTime(10_000);
        unmount();
        expect(sent()[1]).toEqual([5, { seconds: 40, pages: 1 }]);
    });

    it('does not count a pause of more than two minutes', () => {
        const { result, unmount } = renderHook(() => useReadingTime(5, true));

        result.current(1);
        vi.advanceTimersByTime(5 * 60_000);
        result.current(1);
        unmount();
        expect(sent()).toEqual([]);
    });

    it('sends nothing in read-only mode', () => {
        const { result, unmount } = renderHook(() => useReadingTime(5, false));

        result.current(1);
        vi.advanceTimersByTime(30_000);
        result.current(1);
        unmount();
        expect(sent()).toEqual([]);
    });
});
