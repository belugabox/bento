import { Select } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';

import { type ComicInfo, compareNames } from '@server/types';

import { volumeLabel } from '@/components/readingStatus';
import { fetchSeries, fetchSeriesList } from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Réglages de Bento d'une série publiée, repris par ses nouveaux tomes. */
export type JoinedSeries = {
    formatId: number | null;
    age: number | null;
    status: 'ongoing' | 'completed' | null;
    readingMode: string | null;
    /** Parution de l'édition d'origine (signalé : pas reprise). */
    startYear: number | null;
    endYear: number | null;
};

/**
 * Choix d'une série déjà publiée, pour y ajouter les tomes d'un dossier de
 * brouillons : `onJoin` reçoit son nom, le ComicInfo de son premier tome et
 * ses réglages de Bento (format, âge, statut, mode de lecture, parution) ;
 * `onLeave` est appelé quand le choix est effacé. `suggestedId` : série
 * publiée du nom des brouillons, choisie d'elle-même (une fois :
 * `onSuggested`).
 */
export const ExistingSeriesPicker = ({
    libraryId,
    onJoin,
    onLeave,
    suggestedId,
    onSuggested,
}: {
    libraryId: number;
    onJoin: (name: string, source: ComicInfo, settings: JoinedSeries) => void;
    onLeave: () => void;
    suggestedId?: number;
    onSuggested?: () => void;
}) => {
    // Liste chargée à la première ouverture (tout de suite pour une série
    // choisie d'elle-même : son nom s'affiche).
    const [opened, setOpened] = useState(!!suggestedId);
    const series = useQuery(
        () =>
            opened
                ? fetchSeriesList({ libraryId })
                : Promise.resolve(undefined),
        [libraryId, opened],
    );
    const [chosen, setChosen] = useState<string | null>(null);
    const [published, setPublished] = useState<string>();
    const [error, setError] = useState<string>();
    // Choix en cours : la réponse d'un choix précédent est ignorée.
    const latest = useRef<string | null>(null);

    const join = async (value: string | null) => {
        latest.current = value;
        setChosen(value);
        setPublished(undefined);
        setError(undefined);
        if (!value) {
            onLeave();
            return;
        }
        try {
            const details = await fetchSeries(Number(value));
            if (latest.current !== value) return;
            const last = details.volumes.at(-1);
            setPublished(
                `${details.volumes.length} tome(s) publié(s)` +
                    (last ? `, le dernier : ${volumeLabel(last)}` : ''),
            );
            onJoin(details.name, details.volumes[0]?.admin?.comicInfo ?? {}, {
                formatId: details.formatId,
                age: details.age,
                status: details.status,
                readingMode: details.readingMode,
                startYear: details.startYear,
                endYear: details.endYear,
            });
        } catch (e) {
            if (latest.current === value) setError((e as Error).message);
        }
    };

    // Brouillons au nom d'une série publiée : elle est choisie d'elle-même
    // (une fois).
    useEffect(() => {
        if (!suggestedId) return;
        onSuggested?.();
        void join(String(suggestedId));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Select
            label="Ajouter à une série existante"
            placeholder="Non : nouvelle série"
            searchable
            clearable
            clearButtonProps={{
                'aria-label': 'Ne pas ajouter à cette série',
                'aria-hidden': false,
            }}
            nothingFoundMessage={
                series.error
                    ? 'Liste indisponible'
                    : series.data
                      ? 'Aucune série'
                      : 'Chargement…'
            }
            onDropdownOpen={() => setOpened(true)}
            value={chosen}
            onChange={(value) => void join(value)}
            description={published}
            error={error ?? series.error?.message}
            data={[...(series.data ?? [])]
                .sort((a, b) => compareNames(a.name, b.name))
                .map((s) => ({ value: String(s.id), label: s.name }))}
        />
    );
};
