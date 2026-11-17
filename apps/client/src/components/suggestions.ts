import { compareNames } from '@server/types';

import { readingStateOf } from '@/components/seriesFilters';
import type { SeriesSummary } from '@/services/api';

/**
 * Suggestions calculées sur l'appareil, d'après la liste des séries (déjà
 * filtrée par âge) : « Dans le même genre » et « Du même auteur » sur la
 * fiche d'une série, « Pour toi » sur l'accueil.
 */
export type Suggestion = { series: SeriesSummary; reason: string };

type Tag = { key: string; name: string };

// Un thème (« survie ») dit plus qu'un genre (« Action »).
const THEME_WEIGHT = 1.5;
// Même format (manga, BD…) : un petit plus.
const SAME_FORMAT = 0.5;
// Abandonnée : commencée, pas finie, pas ouverte depuis 60 jours (comme les
// statistiques).
const ABANDONED_MS = 60 * 24 * 60 * 60 * 1000;

const key = (value: string) =>
    value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Genres et thèmes d'une série, une fois chacun. */
const tagsOf = (s: SeriesSummary): Tag[] => {
    const seen = new Set<string>();
    const tags: Tag[] = [];
    for (const [prefix, list] of [
        ['g', s.genres ?? []],
        ['t', s.themes ?? []],
    ] as const) {
        for (const name of list) {
            const k = `${prefix}:${key(name)}`;
            if (seen.has(k)) continue;
            seen.add(k);
            tags.push({ key: k, name });
        }
    }
    return tags;
};

/**
 * Poids de chaque genre ou thème : rare, il rapproche davantage (« isekai »
 * plus qu'« Action ») ; un thème plus qu'un genre.
 */
const tagWeights = (all: SeriesSummary[]) => {
    const counts = new Map<string, number>();
    for (const s of all) {
        for (const tag of tagsOf(s)) {
            counts.set(tag.key, (counts.get(tag.key) ?? 0) + 1);
        }
    }
    const weights = new Map<string, number>();
    for (const [k, count] of counts) {
        weights.set(
            k,
            Math.log(1 + all.length / count) *
                (k.startsWith('t:') ? THEME_WEIGHT : 1),
        );
    }
    return weights;
};

/** Les déjà lues après les autres, puis par score. */
const byScore =
    (scores: Map<number, number>) => (a: SeriesSummary, b: SeriesSummary) =>
        Number(readingStateOf(a) === 'read') -
            Number(readingStateOf(b) === 'read') ||
        (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) ||
        compareNames(a.name, b.name);

/**
 * « Dans le même genre » : les séries qui partagent le plus de genres et de
 * thèmes avec celle-ci, les rares comptant davantage, même format en
 * plus ; celles déjà lues en dernier. Raison : les deux points communs les
 * plus parlants (« Horreur · survie »).
 */
export const similarSeries = (
    target: SeriesSummary,
    all: SeriesSummary[],
    limit = 12,
): Suggestion[] => {
    const weights = tagWeights(all);
    const targetTags = new Map(tagsOf(target).map((t) => [t.key, t]));
    const scores = new Map<number, number>();
    const reasons = new Map<number, string>();
    for (const s of all) {
        if (s.id === target.id) continue;
        const shared = tagsOf(s)
            .filter((tag) => targetTags.has(tag.key))
            .sort(
                (a, b) => (weights.get(b.key) ?? 0) - (weights.get(a.key) ?? 0),
            );
        if (shared.length === 0) continue;
        scores.set(
            s.id,
            shared.reduce((sum, tag) => sum + (weights.get(tag.key) ?? 0), 0) +
                (s.format && s.format === target.format ? SAME_FORMAT : 0),
        );
        reasons.set(
            s.id,
            shared
                .slice(0, 2)
                .map((tag) => tag.name)
                .join(' · '),
        );
    }
    return all
        .filter((s) => scores.has(s.id))
        .sort(byScore(scores))
        .slice(0, limit)
        .map((series) => ({ series, reason: reasons.get(series.id)! }));
};

/**
 * Auteurs (scénario, dessin), comparés sans casse ni accents ; « Hiroya
 * Oku / Ji-Hoon Jeong » en donne deux.
 */
const authorsOf = (s: SeriesSummary) => {
    const seen = new Set<string>();
    const authors: Tag[] = [];
    for (const raw of [s.writer, s.penciller]) {
        for (const part of (raw ?? '').split(/[,/&;]/)) {
            const name = part.trim();
            const k = key(name);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            authors.push({ key: k, name });
        }
    }
    return authors;
};

/**
 * « Du même auteur » : les séries qui ont un scénariste ou un dessinateur
 * en commun avec celle-ci ; celles déjà lues en dernier. Raison : le nom
 * partagé.
 */
export const sameAuthorSeries = (
    target: SeriesSummary,
    all: SeriesSummary[],
): Suggestion[] => {
    const names = new Map(authorsOf(target).map((a) => [a.key, a.name]));
    if (names.size === 0) return [];
    const reasons = new Map<number, string>();
    for (const s of all) {
        if (s.id === target.id) continue;
        const shared = authorsOf(s).find((a) => names.has(a.key));
        if (shared) reasons.set(s.id, names.get(shared.key)!);
    }
    return all
        .filter((s) => reasons.has(s.id))
        .sort(byScore(new Map()))
        .map((series) => ({ series, reason: reasons.get(series.id)! }));
};

/**
 * Goût de la personne pour une série lue : ses tomes lus (au moins un pour
 * une série commencée), plus pour une série finie, bien moins pour une
 * série abandonnée.
 */
const liking = (s: SeriesSummary, now: number) => {
    const state = readingStateOf(s);
    if (state === 'unread') return 0;
    const base = Math.max(1, s.readCount);
    if (state === 'read') return base * 1.5;
    const abandoned = !!s.lastReadAt && now - s.lastReadAt > ABANDONED_MS;
    return abandoned ? base * 0.3 : base;
};

/**
 * « Pour toi » : le profil de la personne (genres et thèmes de ce qu'elle
 * lit, pesés par son goût pour chaque série), puis les séries pas
 * commencées qui y ressemblent le plus. Raison : la série lue qui lui
 * ressemble le plus (« Comme Spirale », court : il tient sous la carte).
 * Rien sans lecture.
 */
export const forYou = (
    all: SeriesSummary[],
    { limit = 12, now = Date.now() }: { limit?: number; now?: number } = {},
): Suggestion[] => {
    const weights = tagWeights(all);
    const read = all
        .map((s) => ({ series: s, liking: liking(s, now) }))
        .filter((r) => r.liking > 0);
    if (read.length === 0) return [];
    const profile = new Map<string, number>();
    for (const { series, liking: like } of read) {
        for (const tag of tagsOf(series)) {
            profile.set(tag.key, (profile.get(tag.key) ?? 0) + like);
        }
    }
    const scores = new Map<number, number>();
    const reasons = new Map<number, string>();
    for (const s of all) {
        if (readingStateOf(s) !== 'unread') continue;
        const tags = tagsOf(s);
        const score = tags.reduce(
            (sum, tag) =>
                sum + (profile.get(tag.key) ?? 0) * (weights.get(tag.key) ?? 0),
            0,
        );
        if (score <= 0) continue;
        scores.set(s.id, score);
        // La série lue la plus proche, pesée par le goût pour elle.
        const keys = new Set(tags.map((t) => t.key));
        const closest = read
            .map((r) => ({
                name: r.series.name,
                closeness:
                    r.liking *
                    tagsOf(r.series)
                        .filter((t) => keys.has(t.key))
                        .reduce((sum, t) => sum + (weights.get(t.key) ?? 0), 0),
            }))
            .sort((a, b) => b.closeness - a.closeness)[0];
        if (closest && closest.closeness > 0) {
            reasons.set(s.id, `Comme ${closest.name}`);
        }
    }
    return all
        .filter((s) => scores.has(s.id) && reasons.has(s.id))
        .sort(byScore(scores))
        .slice(0, limit)
        .map((series) => ({ series, reason: reasons.get(series.id)! }));
};
