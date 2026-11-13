import { isNotNull } from 'drizzle-orm';

import type { Db } from '../db';
import { series } from '../db/schema';
import type { Bedetheque } from '../metadata/bedetheque';
import type { MangaNews } from '../metadata/mangaNews';
import {
    type MetadataSource,
    type SourceLink,
    parseSources,
} from '../metadata/sourceLink';
import type { SettingsStore } from '../settings';
import { AppError, RefusedError } from '../tools/errors';
import type { Logger } from '../tools/logger';
import { saveSourceRating } from './ratings';
import {
    type SearchedSite,
    type SheetSearch,
    pendingProposals,
    proposalsBySeries,
    recordSearch,
    searchesToDo,
    verifyProposal,
} from './sheetProposals';
import { sheetChecked, sourceSheetsMap } from './sheets';

/**
 * Rythme de la mise à jour, très lent pour ne jamais gêner les sites (ni
 * risquer d'être bloqué) : une fiche toutes les 10 minutes au plus, en
 * alternant les sites, seulement la nuit, et chaque fiche une fois par mois.
 */
// Rythme par défaut ; l'admin le choisit (`sheetRefreshMinutes`).
export const REFRESH_INTERVAL_MS = 10 * 60_000;
export const NIGHT_START_HOUR = 2;
export const NIGHT_END_HOUR = 6;
export const RECHECK_AFTER_MS = 30 * 24 * 3600_000;
/**
 * Pause d'un site après un refus (anti-robot, trop de requêtes) ou une
 * panne, malgré le nouvel essai : 1 h, puis 6 h, puis 24 h s'il refuse
 * encore ; une requête réussie remet le compte à zéro. Les autres sites
 * continuent.
 */
export const PAUSES_MS = [3600_000, 6 * 3600_000, 24 * 3600_000];
const TICK_MS = 60_000;

/** Sites relus : ceux qui donnent une note des lecteurs. */
const REFRESHED_SITES: MetadataSource[] = ['manga-news', 'bedetheque'];

export type SheetRefreshStatus = {
    enabled: boolean;
    /** Passage lancé à la main, en cours (même le jour). */
    running: boolean;
    /** Fiches liées aux séries (sites actifs), et celles à relire. */
    linked: number;
    due: number;
    /** Fiches manquantes à chercher, et fiches proposées à l'admin. */
    toSearch: number;
    proposed: number;
    lastCheckedAt: Date | null;
    /** Sites en pause : jusqu'à quand, et pourquoi. */
    pauses: { site: MetadataSource; until: Date; error: string }[];
    intervalMinutes: number;
    night: { start: number; end: number };
};

/**
 * Relit en arrière-plan les fiches liées aux séries (Manga-news,
 * Bedetheque), une à une : la note des lecteurs est mise à jour, les autres
 * changements sont seulement signalés (« Fiche à revoir »). Cherche aussi
 * la fiche des séries qui n'en ont pas sur un site, pour la proposer à
 * l'admin (jamais liée d'office). Une requête à la fois ; un refus est
 * réessayé une fois, à l'identique, comme pour « Remplir » (jamais
 * contourné) ; s'il persiste, seul ce site fait une pause (`PAUSES_MS`).
 */
export class SheetRefresher {
    private timer: NodeJS.Timeout | undefined;
    private busy = false;
    private forced = false;
    private lastFetchAt = 0;
    private lastSite: MetadataSource | undefined;
    private lastCheckedAt: Date | null = null;
    // Sites en pause, et leurs refus d'affilée.
    private pauses = new Map<
        MetadataSource,
        { until: number; error: string }
    >();
    private refusals = new Map<MetadataSource, number>();

    constructor(
        private readonly db: Db,
        private readonly sites: {
            mangaNews: MangaNews;
            bedetheque: Bedetheque;
        },
        private readonly settings: SettingsStore,
        private readonly logger?: Logger,
        private readonly now: () => Date = () => new Date(),
    ) {}

    start = () => {
        this.timer ??= setInterval(() => void this.tick(), TICK_MS).unref();
    };

    stop = () => {
        clearInterval(this.timer);
        this.timer = undefined;
    };

    /** Fiches à relire, la plus ancienne d'abord (jamais lue en tête). */
    private dueLinks = () => {
        const disabled = this.settings.get().disabledSources;
        const checked = sourceSheetsMap(this.db);
        const limit = this.now().getTime() - RECHECK_AFTER_MS;
        const links = new Map<string, SourceLink>();
        for (const row of this.db
            .select({ sources: series.sources })
            .from(series)
            .where(isNotNull(series.sources))
            .all()) {
            for (const link of parseSources(row.sources)) {
                if (
                    REFRESHED_SITES.includes(link.site) &&
                    !disabled.includes(link.site)
                ) {
                    links.set(`${link.site}:${link.id}`, link);
                }
            }
        }
        const due = [...links]
            .map(([key, link]) => ({
                link,
                checkedAt: checked.get(key)?.checkedAt.getTime() ?? 0,
            }))
            .filter((item) => item.checkedAt < limit)
            .sort((a, b) => a.checkedAt - b.checkedAt)
            .map((item) => item.link);
        return { linked: links.size, due };
    };

    private inNight = () => {
        const hour = this.now().getHours();
        return hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;
    };

    status = (): SheetRefreshStatus => {
        const { linked, due } = this.dueLinks();
        const disabled = this.settings.get().disabledSources;
        return {
            enabled: this.settings.get().sheetRefresh,
            running: this.forced,
            linked,
            due: due.length,
            toSearch:
                searchesToDo(this.db, this.now().getTime(), disabled).length +
                pendingProposals(this.db, disabled).length,
            proposed: [...proposalsBySeries(this.db).values()].flat().length,
            lastCheckedAt: this.lastCheckedAt,
            pauses: [...this.pauses]
                .filter(([, pause]) => pause.until > this.now().getTime())
                .map(([site, pause]) => ({
                    site,
                    until: new Date(pause.until),
                    error: pause.error,
                })),
            intervalMinutes: this.settings.get().sheetRefreshMinutes,
            night: { start: NIGHT_START_HOUR, end: NIGHT_END_HOUR },
        };
    };

    /** « Lancer maintenant » : un passage, même le jour, au même rythme. */
    runNow = () => {
        this.forced = true;
        void this.tick();
        return this.status();
    };

    /** Une fiche, si c'est le moment ; appelé chaque minute. */
    tick = async () => {
        if (this.busy) return;
        const now = this.now().getTime();
        if (
            !this.forced &&
            !(this.settings.get().sheetRefresh && this.inNight())
        ) {
            return;
        }
        const interval = this.settings.get().sheetRefreshMinutes * 60_000;
        if (now - this.lastFetchAt < interval) return;

        // Sites en pause : leur travail attend.
        const actions = this.actions(now).filter(
            (a) => (this.pauses.get(a.site)?.until ?? 0) <= now,
        );
        if (actions.length === 0) {
            this.forced = false;
            return;
        }
        // Un autre site que la fois d'avant, s'il y a de quoi faire.
        const action =
            actions.find((a) => a.site !== this.lastSite) ?? actions[0]!;
        this.busy = true;
        this.lastFetchAt = now;
        this.lastSite = action.site;
        try {
            await action.run();
            this.lastCheckedAt = this.now();
            this.refusals.delete(action.site);
            this.pauses.delete(action.site);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            // Refus (malgré le nouvel essai), site injoignable ou en panne :
            // ce site attend, de plus en plus longtemps ; les autres non.
            const count = (this.refusals.get(action.site) ?? 0) + 1;
            this.refusals.set(action.site, count);
            const pause = PAUSES_MS[Math.min(count, PAUSES_MS.length) - 1]!;
            this.pauses.set(action.site, {
                until: now + pause,
                error: message,
            });
            const refused = error instanceof RefusedError;
            this.logger?.warn(
                `Mise à jour des fiches : ${action.site} en pause ${pause / 3600_000} h (${refused ? 'refus' : 'erreur'} n° ${count}) : ${message}`,
            );
        } finally {
            this.busy = false;
        }
    };

    /**
     * Ce qu'il reste à faire, une requête chacun : lire une fiche trouvée
     * (pour la proposer), relire une fiche liée, chercher une fiche.
     */
    private actions = (now: number) => {
        const disabled = this.settings.get().disabledSources;
        return [
            ...pendingProposals(this.db, disabled).map((proposal) => ({
                site: proposal.site as MetadataSource,
                run: () => this.verify(proposal),
            })),
            ...this.dueLinks().due.map((link) => ({
                site: link.site,
                run: () => this.check(link),
            })),
            ...searchesToDo(this.db, now, disabled).map((search) => ({
                site: search.site as MetadataSource,
                run: () => this.search(search),
            })),
        ];
    };

    private readSheet = async (site: SearchedSite, id: string) => {
        try {
            return site === 'manga-news'
                ? await this.sites.mangaNews.series(id)
                : await this.sites.bedetheque.series(id);
        } catch (error) {
            // Fiche disparue (ou devenue illisible) : sans pause.
            if (error instanceof AppError && error.status === 404) {
                return undefined;
            }
            throw error;
        }
    };

    /** Cherche la fiche d'une série par son nom (une écriture). */
    private search = async (search: SheetSearch) => {
        const results =
            search.site === 'manga-news'
                ? await this.sites.mangaNews.search(search.text)
                : await this.sites.bedetheque.search(search.text);
        const found = recordSearch(this.db, search, results, this.now());
        this.logger?.debug(
            `Fiche cherchée : ${search.site} « ${search.text} » (${found} trouvée(s))`,
        );
    };

    /** Lit une fiche trouvée : proposée, avec sa note gardée. */
    private verify = async (proposal: {
        seriesId: number;
        site: SearchedSite;
        sourceId: string;
    }) => {
        const sheet = await this.readSheet(proposal.site, proposal.sourceId);
        saveSourceRating(
            this.db,
            proposal.site,
            proposal.sourceId,
            sheet?.rating,
        );
        if (sheet)
            sheetChecked(
                this.db,
                proposal.site,
                proposal.sourceId,
                sheet,
                this.now(),
            );
        verifyProposal(this.db, proposal, sheet);
    };

    private check = async (link: SourceLink) => {
        // Fiche disparue : signalée (« Fiche introuvable »), sans pause.
        const sheet = await this.readSheet(link.site as SearchedSite, link.id);
        saveSourceRating(this.db, link.site, link.id, sheet?.rating);
        sheetChecked(this.db, link.site, link.id, sheet, this.now());
        this.logger?.debug(`Fiche relue : ${link.site}:${link.id}`);
    };
}
