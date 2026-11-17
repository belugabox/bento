import { Group, Text, UnstyledButton } from '@mantine/core';
import { IconChartLine, IconChevronRight } from '@tabler/icons-react';
import { Link } from 'react-router';

import { formatDuration } from '@/components/format';
import { fetchMyStats } from '@/services/api';
import { useQuery } from '@/services/useQuery';

/** Lecture de la semaine, et le lien vers « Mes statistiques ». */
export const WeekLine = () => {
    const { data } = useQuery(() => fetchMyStats('7d'), [], {
        cacheKey: 'home:week',
    });
    if (!data) return null;
    const volumes = data.completed;
    return (
        <UnstyledButton
            component={Link}
            to="/me/stats"
            p="sm"
            style={{
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-md)',
            }}
        >
            <Group gap="sm" wrap="nowrap">
                <IconChartLine
                    size={18}
                    color="var(--mantine-primary-color-light-color)"
                />
                <Text size="sm" style={{ flex: 1 }}>
                    {data.seconds > 0 ? (
                        <>
                            <b>{formatDuration(data.seconds)}</b> de lecture
                            cette semaine
                            {volumes > 0 &&
                                ` · ${volumes} tome${volumes > 1 ? 's' : ''} fini${volumes > 1 ? 's' : ''}`}
                        </>
                    ) : (
                        'Pas encore de lecture cette semaine'
                    )}
                </Text>
                <IconChevronRight size={16} />
            </Group>
        </UnstyledButton>
    );
};
