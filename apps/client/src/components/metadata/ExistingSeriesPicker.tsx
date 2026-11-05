import { Select } from '@mantine/core';
import { useState } from 'react';

import { type ComicInfo, compareNames } from '@server/types';

import { volumeLabel } from '@/components/readingStatus';
import { fetchSeries, fetchSeriesList } from '@/services/api';
import { useQuery } from '@/services/useQuery';

/**
 * Choix d'une série déjà publiée, pour y ajouter les tomes d'un dossier de
 * brouillons : `onJoin` reçoit son nom et le ComicInfo de son premier tome.
 */
export const ExistingSeriesPicker = ({
    libraryId,
    onJoin,
}: {
    libraryId: number;
    onJoin: (name: string, source: ComicInfo) => void;
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

    const join = async (value: string | null) => {
        setChosen(value);
        setPublished(undefined);
        setError(undefined);
        if (!value) return;
        try {
            const details = await fetchSeries(Number(value));
            const last = details.volumes.at(-1);
            setPublished(
                `${details.volumes.length} tome(s) publié(s)` +
                    (last ? `, le dernier : ${volumeLabel(last)}` : ''),
            );
            onJoin(details.name, details.volumes[0]?.admin?.comicInfo ?? {});
        } catch (e) {
            setError((e as Error).message);
        }
    };

    return (
        <Select
            label="Ajouter à une série existante"
            placeholder="Non : nouvelle série"
            searchable
            clearable
            nothingFoundMessage={series.data ? 'Aucune série' : 'Chargement…'}
            onDropdownOpen={() => setOpened(true)}
            value={chosen}
            onChange={(value) => void join(value)}
            description={published}
            error={error}
            data={[...(series.data ?? [])]
                .sort((a, b) => compareNames(a.name, b.name))
                .map((s) => ({ value: String(s.id), label: s.name }))}
        />
    );
};
