import { afterEach, describe, expect, it } from 'vitest';

import { queuePosition, readManageQueue, saveManageQueue } from './manageQueue';

const queue = {
    items: [
        { id: 2, name: 'Coq de combat' },
        { id: 1, name: 'Spirale' },
        { id: 3, name: 'Gantz' },
    ],
    search: 'sheet=bedetheque',
};

afterEach(() => sessionStorage.clear());

describe('list of the Series page, followed by the editor', () => {
    it('is kept for the tab', () => {
        expect(readManageQueue()).toBeNull();
        saveManageQueue(queue);
        expect(readManageQueue()).toEqual(queue);
    });

    it('gives the place of the series and the next one, round the list', () => {
        expect(queuePosition(queue, 1)).toEqual({
            position: 2,
            total: 3,
            next: { id: 3, name: 'Gantz' },
        });
        expect(queuePosition(queue, 3)?.next).toEqual({
            id: 2,
            name: 'Coq de combat',
        });
        // Seule dans la liste : pas de suivante.
        expect(
            queuePosition(
                { items: [{ id: 1, name: 'Spirale' }], search: '' },
                1,
            )?.next,
        ).toBeUndefined();
        expect(queuePosition(null, 1)).toBeNull();
    });
});
