import { Indicator, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconBooks, IconHome } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router';

import { UserAvatar } from '@/components/accounts/UserAvatar';
import {
    BOTTOM_NAV_HEIGHT,
    NAV_ITEMS,
    navSection,
} from '@/components/navigation';
import { useCurrentUser } from '@/services/auth';

/**
 * Barre d'onglets du bas : Accueil, Bibliothèque, Moi (son avatar). Cachée
 * dans le lecteur, qui n'est pas dans cette mise en page.
 */
export const BottomNav = ({ badge = 0 }: { badge?: number }) => {
    const { pathname } = useLocation();
    const user = useCurrentUser();
    const current = navSection(pathname);
    return (
        <nav
            aria-label="Navigation"
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${NAV_ITEMS.length}, 1fr)`,
                height: BOTTOM_NAV_HEIGHT,
            }}
        >
            {NAV_ITEMS.map((item) => {
                const active = current === item.to;
                const color = active
                    ? 'var(--mantine-primary-color-light-color)'
                    : 'var(--mantine-color-dimmed)';
                return (
                    <UnstyledButton
                        key={item.to}
                        component={Link}
                        to={item.to}
                        aria-current={active ? 'page' : undefined}
                        style={{ color }}
                    >
                        <Stack gap={2} align="center" justify="center" h="100%">
                            {item.to === '/' ? (
                                <IconHome size={24} stroke={active ? 2 : 1.6} />
                            ) : item.to === '/library' ? (
                                <IconBooks
                                    size={24}
                                    stroke={active ? 2 : 1.6}
                                />
                            ) : (
                                <Indicator
                                    size={8}
                                    offset={2}
                                    disabled={badge === 0}
                                >
                                    <UserAvatar
                                        name={user.name}
                                        seed={user.avatarSeed}
                                        size={24}
                                        radius="xl"
                                        style={
                                            active
                                                ? {
                                                      outline: `2px solid ${color}`,
                                                      outlineOffset: 1,
                                                  }
                                                : undefined
                                        }
                                    />
                                </Indicator>
                            )}
                            <Text size="11px" fw={active ? 600 : 400} lh={1}>
                                {item.label}
                            </Text>
                        </Stack>
                    </UnstyledButton>
                );
            })}
        </nav>
    );
};
