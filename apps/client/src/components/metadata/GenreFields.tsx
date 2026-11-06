import { MultiSelect, TagsInput } from '@mantine/core';

import { type GenreEntry, classify } from '@server/types';

/**
 * Genres (pris dans la liste gérée par l'admin) et thèmes libres d'une
 * série, enregistrés dans `Genre` et `Tags` du ComicInfo. Les genres bruts
 * des fichiers sont rangés comme sur la fiche : un mot inconnu y devient
 * un thème, un âge disparaît à l'enregistrement.
 */
export const GenreFields = ({
    genre,
    tags,
    catalog,
    genreProps,
    tagsProps,
    onChange,
}: {
    genre: string;
    tags: string;
    catalog: GenreEntry[];
    /** Champ modifié, pas encore enregistré (`changed` de l'éditeur). */
    genreProps?: object;
    tagsProps?: object;
    onChange: (genre: string, tags: string) => void;
}) => {
    const { genres, themes } = classify(genre, tags, catalog);
    return (
        <>
            <MultiSelect
                label="Genres"
                placeholder={genres.length ? undefined : 'Aucun'}
                searchable
                clearable
                data={catalog.map((entry) => entry.name)}
                value={genres}
                onChange={(value) =>
                    onChange(value.join(', '), themes.join(', '))
                }
                {...genreProps}
            />
            <TagsInput
                label="Thèmes"
                placeholder={themes.length ? undefined : 'Aucun'}
                value={themes}
                onChange={(value) =>
                    onChange(genres.join(', '), value.join(', '))
                }
                {...tagsProps}
            />
        </>
    );
};
