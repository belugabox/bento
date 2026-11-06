import { Select } from '@mantine/core';
import { useRef, useState } from 'react';

import { type ComicInfo, compareNames } from '@server/types';

import { volumeLabel } from '@/components/readingStatus';
import { fetchSeries, fetchSeriesList } from '@/services/api';
import { useQuery } from '@/services/useQuery';

/**
 * Choix d'une série déjà publiée, pour y ajouter les tomes d'un dossier de
 * brouillons : `onJoin` reçoit son nom et le ComicInfo de son premier tome,
 * `onLeave` est appelé quand le choix est effacé.
 */
export const ExistingSeriesPicker = ({
    libraryId,
    onJoin,
    onLeave,
}: {
    libraryId: number;
    onJoin: (name: string, source: ComicInfo) => void;
    onLeave: () => void;
}) => {
    // Liste chargée à la première ouverture seulement.
    const [opened, setOpened] = useState(false);
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
            onJoin(details.name, details.volumes[0]?.admin?.comicInfo ?? {});
        } catch (e) {
            if (latest.current === value) setError((e as Error).message);
        }
    };

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
