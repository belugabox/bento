/** Tâche de fond en cours (scan, compression…), affichée à l'admin. */
export type Task = {
    id: number;
    label: string;
    /** Avancement : éléments traités sur le total, quand on le connaît. */
    done?: number;
    total?: number;
    startedAt: number;
};

/** Tâches de fond en cours : chacune s'ajoute au début et se retire à la fin. */
export class TaskList {
    private tasks = new Map<number, Task>();
    private nextId = 1;

    /** Démarre une tâche ; `finish` doit toujours être appelé (finally). */
    start = (label: string, total?: number) => {
        const task: Task = {
            id: this.nextId++,
            label,
            startedAt: Date.now(),
            ...(total !== undefined && { done: 0, total }),
        };
        this.tasks.set(task.id, task);
        return {
            progress: (done: number, total = task.total) => {
                Object.assign(task, { done, total });
            },
            rename: (label: string) => {
                task.label = label;
            },
            finish: () => {
                this.tasks.delete(task.id);
            },
        };
    };

    /** Tâches en cours, de la plus ancienne à la plus récente. */
    list = (): Task[] => [...this.tasks.values()].map((task) => ({ ...task }));

    /** Exécute `run` comme une tâche. */
    run = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
        const task = this.start(label);
        try {
            return await run();
        } finally {
            task.finish();
        }
    };
}
