import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    Bedetheque,
    authorName,
    parseSearch,
    parseSeriesPage,
} from '../src/metadata/bedetheque';

// Pages réelles du site, sans leurs scripts (novembre 2026).
const fixture = (name: string) =>
    readFileSync(path.join(__dirname, 'fixtures', 'bedetheque', name), 'utf-8');

describe('Bedetheque pages', () => {
    it('reads the series search (autocompletion)', () => {
        const results = parseSearch(
            JSON.parse(fixture('search-blacksad.json')),
        );
        expect(results[0]).toEqual({
            id: '500',
            title: 'Blacksad',
            country: 'France',
        });
        // Article remis devant.
        expect(
            parseSearch([{ id: '46521', label: 'Sculpteur (Le)', desc: '' }])[0]
                ?.title,
        ).toBe('Le Sculpteur');
        expect(results[2]).toMatchObject({
            title: 'Blacksad (en anglais, Dark Horse)',
            country: 'USA',
        });
    });

    it('reads a series: genres, run, authors, publisher, summary', () => {
        const series = parseSeriesPage(fixture('blacksad.html'), '500')!;
        expect(series).toMatchObject({
            id: '500',
            title: 'Blacksad',
            url: 'https://www.bedetheque.com/serie_500.html',
            genres: ['Policier'],
            origin: 'Franco-Belge',
            publisher: 'Dargaud',
            volumeCount: 7,
            firstYear: 2000,
            lastYear: 2023,
            ongoing: true,
            oneShot: false,
        });
        expect(series.writer).toBe('Juan Díaz Canalès');
        expect(series.penciller).toBe('Juanjo Guarnido');
        expect(series.coverUrl).toMatch(/^https:\/\/www\.bedetheque\.com\//);
    });

    it('reads a one shot, finished from the start', () => {
        const series = parseSeriesPage(
            fixture('asterios-polyp.html'),
            '25654',
        )!;
        expect(series).toMatchObject({
            title: 'Asterios Polyp',
            genres: ['Roman graphique'],
            origin: 'Comics',
            writer: 'David Mazzucchelli',
            penciller: 'David Mazzucchelli',
            publisher: 'Casterman',
            volumeCount: 1,
            firstYear: 2010,
            ongoing: false,
            oneShot: true,
        });
        expect(series.lastYear).toBeUndefined();
        expect(series.summary).toMatch(/^Fils d.immigrant, Asterios Polyp/);
    });

    it('puts first names first', () => {
        expect(authorName('Mazzucchelli, David')).toBe('David Mazzucchelli');
        expect(authorName('Moebius')).toBe('Moebius');
    });
});

describe('Bedetheque site', () => {
    const page = (body: string, status = 200, headers = {}) =>
        new Response(body, { status, headers });

    it('tries once more after a refusal, never more', async () => {
        let calls = 0;
        const site = new Bedetheque(
            (async () => {
                calls++;
                return calls === 1
                    ? page('<title>Just a moment...</title>', 403)
                    : page(fixture('search-blacksad.json'));
            }) as unknown as typeof fetch,
            { retryDelayMs: 0 },
        );
        expect((await site.search('blacksad'))[0]?.title).toBe('Blacksad');
        expect(calls).toBe(2);
    });

    it('gives up when the site keeps refusing', async () => {
        const site = new Bedetheque(
            (async () =>
                page(
                    '<title>Just a moment...</title>',
                    403,
                )) as unknown as typeof fetch,
            { retryDelayMs: 0 },
        );
        await expect(site.series('500')).rejects.toThrow(
            /protection anti-robot/,
        );
    });
});
