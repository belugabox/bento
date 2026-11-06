import { Autocomplete, type AutocompleteProps } from '@mantine/core';

import { creditSuggestions } from './credits';

/**
 * Scénario, dessin ou éditeur : texte libre, avec les noms déjà connus de
 * la bibliothèque en suggestion (évite « Kurokawa » et « Kurokawa Éditions »).
 */
export const CreditInput = ({
    names,
    value,
    onChange,
    ...props
}: Omit<AutocompleteProps, 'data' | 'value' | 'onChange'> & {
    names: string[];
    value: string;
    onChange: (value: string) => void;
}) => (
    <Autocomplete
        {...props}
        value={value}
        onChange={onChange}
        data={creditSuggestions(names, value)}
        // Déjà filtrées : toutes sont montrées.
        filter={({ options }) => options}
    />
);
