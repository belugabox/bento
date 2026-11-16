import { Anchor, Paper, Text } from '@mantine/core';
import { Link } from 'react-router';

/** Chiffre clé : valeur en grand, libellé en dessous. */
export const StatTile = ({
    label,
    value,
    hint,
    to,
}: {
    label: string;
    value: string;
    hint?: string;
    to?: string;
}) => (
    <Paper withBorder radius="md" p="md">
        <Text size="xl" fw={700} lh={1.1}>
            {to ? (
                <Anchor component={Link} to={to} inherit c="inherit">
                    {value}
                </Anchor>
            ) : (
                value
            )}
        </Text>
        <Text size="sm" c="dimmed">
            {label}
        </Text>
        {hint && (
            <Text size="xs" c="dimmed">
                {hint}
            </Text>
        )}
    </Paper>
);
