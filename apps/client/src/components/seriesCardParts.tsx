import { Badge, ThemeIcon } from '@mantine/core';
import { IconBookmarkFilled, IconCheck } from '@tabler/icons-react';

import { seriesVolumesLabel } from '@/components/readingStatus';
import { readingStateOf } from '@/components/seriesFilters';
import type { SeriesSummary } from '@/services/api';

/**
 * Pastille « +2 », en haut à gauche (l'icône d'état est à droite) : tomes
 * ajoutés depuis la dernière lecture de la série (rien sans nouveauté).
 */
export const newBadge = (count: number | undefined) =>
    count ? (
        <Badge
            size="sm"
            variant="filled"
            aria-label={`${count} nouveau${count > 1 ? 'x' : ''} tome${count > 1 ? 's' : ''}`}
        >
            +{count}
        </Badge>
    ) : undefined;

/** Icône grise d'une série : lue, ou dans la liste « à lire ». */
export const seriesBadge = (state: string, toRead: boolean) =>
    state === 'read' ? (
        <ThemeIcon size="sm" radius="xl" color="gray" aria-label="Série lue">
            <IconCheck size={12} />
        </ThemeIcon>
    ) : toRead ? (
        <ThemeIcon size="sm" radius="xl" color="gray" aria-label="À lire">
            <IconBookmarkFilled size={11} />
        </ThemeIcon>
    ) : undefined;

/** Ligne sous le nom : tomes lus d'une série commencée, sinon ses tomes. */
export const seriesSubtitle = (s: SeriesSummary) =>
    readingStateOf(s) === 'started'
        ? `${s.readCount} / ${s.volumeCount} lus`
        : seriesVolumesLabel(s.volumeCount, s.volumeKinds);

/**
 * « 1997 – 2003 », « depuis 2019 », « 2009 » ; rien sans année. `compact` :
 * « 1997–2003 », pour tenir sous une carte.
 */
export const releaseLabel = (
    s: Pick<SeriesSummary, 'year' | 'endYear' | 'status'>,
    { compact = false }: { compact?: boolean } = {},
) =>
    !s.year
        ? ''
        : s.endYear && s.endYear !== s.year
          ? compact
              ? `${s.year}–${s.endYear}`
              : `${s.year} – ${s.endYear}`
          : s.status === 'ongoing'
            ? `depuis ${s.year}`
            : String(s.year);
