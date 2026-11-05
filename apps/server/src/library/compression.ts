import type { Logger } from '../tools/logger';
import type { LibraryFiles } from './files';

export type CompressionJob = {
    libraryId: number;
    path: string;
    state: 'pending' | 'running' | 'done' | 'failed';
    originalSize?: number;
    compressedSize?: number;
    error?: string;
};

// Tâches terminées gardées pour l'affichage.
const MAX_FINISHED = 500;

/**
 * Compressions en file d'attente, une à la fois, en arrière-plan : un gros
 * tome prend plus d'une minute, plus qu'une requête n'en supporte derrière
 * Cloudflare. Le client suit l'avancement.
 */
export class CompressionQueue {
    private jobs: CompressionJob[] = [];
    private running = false;

    constructor(
        private readonly files: LibraryFiles,
        private readonly logger: Logger,
    ) {}

    /** Ajoute des fichiers (chemins vérifiés tout de suite). */
    add = (libraryId: number, paths: string[]) => {
        for (const path of paths) this.files.fullPath(libraryId, path);
        for (const path of paths) {
            const queued = this.jobs.some(
                (job) =>
                    job.libraryId === libraryId &&
                    job.path === path &&
                    (job.state === 'pending' || job.state === 'running'),
            );
            if (queued) continue;
            // Une compression refaite remplace l'ancien résultat.
            this.jobs = this.jobs.filter(
                (job) => !(job.libraryId === libraryId && job.path === path),
            );
            this.jobs.push({ libraryId, path, state: 'pending' });
        }
        void this.run();
        return this.status();
    };

    status = () => ({ jobs: this.jobs });

    /** Oublie les tâches terminées. */
    clear = () => {
        this.jobs = this.jobs.filter(
            (job) => job.state === 'pending' || job.state === 'running',
        );
        return this.status();
    };

    /** Attend la fin de la file (tests). */
    idle = async () => {
        while (this.running) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    };

    private run = async () => {
        if (this.running) return;
        this.running = true;
        try {
            let job: CompressionJob | undefined;
            while ((job = this.jobs.find((j) => j.state === 'pending'))) {
                job.state = 'running';
                try {
                    Object.assign(
                        job,
                        await this.files.compress(job.libraryId, job.path),
                    );
                    job.state = 'done';
                } catch (error) {
                    job.state = 'failed';
                    job.error =
                        error instanceof Error ? error.message : String(error);
                    this.logger.warn(
                        `Compression de ${job.path} : ${job.error}`,
                    );
                }
            }
            const finished = this.jobs.filter(
                (j) => j.state === 'done' || j.state === 'failed',
            );
            if (finished.length > MAX_FINISHED) {
                const dropped = new Set(
                    finished.slice(0, finished.length - MAX_FINISHED),
                );
                this.jobs = this.jobs.filter((j) => !dropped.has(j));
            }
        } finally {
            this.running = false;
        }
    };
}
