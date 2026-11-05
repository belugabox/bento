import { pino } from 'pino';

export const createLogger = (level: string) =>
    pino({
        level,
        transport: {
            target: 'pino-pretty',
            options: { colorize: true },
        },
    });

export type Logger = ReturnType<typeof createLogger>;
