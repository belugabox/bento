import {
    Badge,
    Group,
    NavLink,
    Paper,
    Stack,
    Text,
    Title,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowBackUp,
    IconChartBar,
    IconChartLine,
    IconChevronRight,
    IconDownload,
    IconEye,
    IconInbox,
    IconLogout,
    IconPalette,
    IconSettings,
    IconTags,
    IconUsers,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { AppearanceModal } from '@/components/AppearanceModal';
import { PreviewModal } from '@/components/PreviewModal';
import { UserAvatar } from '@/components/accounts/UserAvatar';
import { ageLimitLabel } from '@/components/ageLimits';
import { formatSize } from '@/components/format';
import { switchView } from '@/components/switchView';
import { useWeekLabel } from '@/components/weekLabel';
import { useDownloads } from '@/offline/downloads';
import {
    fetchPendingDrafts,
    fetchToClassifyCount,
    stopPreview,
} from '@/services/api';
import { logout, useCurrentUser } from '@/services/auth';
import { useQuery } from '@/services/useQuery';

/** Un bloc de liens, sous un titre discret. */
const LinkGroup = ({
    title,
    children,
}: {
    title?: string;
    children: ReactNode;
}) => (
    <Stack gap={6} component="section" aria-label={title}>
        {title && (
            <Text
                size="xs"
                c="var(--mantine-primary-color-light-color)"
                fw={600}
                tt="uppercase"
                style={{ letterSpacing: '0.08em' }}
            >
                {title}
            </Text>
        )}
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
            {children}
        </Paper>
    </Stack>
);

/** Lien vers une page : icône, nom, à droite un compte ou un chevron. */
const PageLink = ({
    to,
    icon,
    label,
    description,
    side,
}: {
    to: string;
    icon: ReactNode;
    label: string;
    description?: string;
    side?: ReactNode;
}) => (
    <NavLink
        component={Link}
        to={to}
        leftSection={icon}
        label={label}
        description={description}
        rightSection={
            <Group gap={6} wrap="nowrap">
                {side}
                <IconChevronRight size={14} />
            </Group>
        }
    />
);

/** Tomes et place prise sur l'appareil. */
const downloadsLabel = (count: number, bytes: number) =>
    count
        ? `${count} tome${count > 1 ? 's' : ''} · ${formatSize(bytes)}`
        : 'Aucun tome';

/** Admin : séries à classer et brouillons en attente, sur les liens. */
const AdminLinks = () => {
    const toClassify = useQuery(fetchToClassifyCount, []);
    const drafts = useQuery(fetchPendingDrafts, []);
    const pill = (count: number | undefined) =>
        count ? (
            <Badge size="sm" variant="light" circle>
                {count}
            </Badge>
        ) : null;
    return (
        <LinkGroup title="Administration">
            <PageLink
                to="/manage"
                icon={<IconTags size={18} />}
                label="Séries"
                description="Fiches à compléter, tomes manquants"
                side={pill(toClassify.data?.count)}
            />
            <PageLink
                to="/drafts"
                icon={<IconInbox size={18} />}
                label="Brouillons"
                side={pill(drafts.data?.series)}
            />
            <PageLink
                to="/stats"
                icon={<IconChartBar size={18} />}
                label="Statistiques"
            />
            <PageLink
                to="/users"
                icon={<IconUsers size={18} />}
                label="Comptes"
            />
            <PageLink
                to="/settings"
                icon={<IconSettings size={18} />}
                label="Réglages"
            />
        </LinkGroup>
    );
};

/**
 * « Moi » : sa lecture de la semaine, ce qui est sur l'appareil, son compte
 * et le thème ; pour l'admin, l'administration et « Voir comme un
 * lecteur » ; la déconnexion.
 */
export const MePage = () => {
    const user = useCurrentUser();
    const isAdmin = user.role === 'admin';
    const { downloads } = useDownloads();
    const week = useWeekLabel();
    const [previewOpened, previewModal] = useDisclosure(false);
    const [appearanceOpened, appearanceModal] = useDisclosure(false);
    const bytes = downloads.reduce((sum, volume) => sum + volume.bytes, 0);

    return (
        <Stack gap="lg" maw={640} mx="auto">
            <PreviewModal opened={previewOpened} onClose={previewModal.close} />
            <AppearanceModal
                opened={appearanceOpened}
                onClose={appearanceModal.close}
            />
            {/* Son compte, avec son avatar et son nom (demandé) : un
                toucher ouvre « Mon compte » ; dessous, le thème. */}
            <Paper
                withBorder
                radius="md"
                component="section"
                aria-label="Mon compte"
                style={{ overflow: 'hidden' }}
            >
                <UnstyledButton
                    component={Link}
                    to="/account"
                    aria-label="Mon compte"
                    p="md"
                    w="100%"
                    style={{ display: 'block' }}
                >
                    <Group gap="md" wrap="nowrap">
                        <UserAvatar
                            name={user.name}
                            seed={user.avatarSeed}
                            size={64}
                            radius="xl"
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Title order={2} lineClamp={1}>
                                {user.name}
                            </Title>
                            <Text size="sm" c="dimmed">
                                {user.preview?.user
                                    ? 'Vue simulée · lecture seule'
                                    : user.preview
                                      ? `Vue lecteur · ${ageLimitLabel(user.preview.maxAge)}`
                                      : isAdmin
                                        ? 'Administrateur'
                                        : 'Lecteur'}
                            </Text>
                            <Text size="xs" c="dimmed">
                                Identifiant, mot de passe, avatar
                            </Text>
                        </div>
                        <IconChevronRight size={16} />
                    </Group>
                </UnstyledButton>
                <NavLink
                    component="button"
                    leftSection={<IconPalette size={18} />}
                    label="Thème et affichage…"
                    onClick={appearanceModal.open}
                    style={{
                        borderTop:
                            '1px solid var(--mantine-color-default-border)',
                    }}
                />
            </Paper>

            <LinkGroup title="Ma lecture">
                <PageLink
                    to="/me/stats"
                    icon={<IconChartLine size={18} />}
                    label="Mes statistiques"
                    description={week}
                />
            </LinkGroup>

            <LinkGroup title="Sur cet appareil">
                <PageLink
                    to="/downloads"
                    icon={<IconDownload size={18} />}
                    label="Téléchargements"
                    description={downloadsLabel(downloads.length, bytes)}
                />
            </LinkGroup>

            {isAdmin && <AdminLinks />}

            <LinkGroup>
                {(isAdmin || user.preview) && (
                    <NavLink
                        component="button"
                        leftSection={<IconEye size={18} />}
                        label="Voir comme un lecteur…"
                        onClick={previewModal.open}
                    />
                )}
                {user.preview && (
                    <NavLink
                        component="button"
                        c="orange"
                        leftSection={<IconArrowBackUp size={18} />}
                        label="Revenir à la vue admin"
                        onClick={() => void switchView(stopPreview)}
                    />
                )}
                <NavLink
                    component="button"
                    leftSection={<IconLogout size={18} />}
                    label="Se déconnecter"
                    onClick={() => void logout()}
                />
            </LinkGroup>
        </Stack>
    );
};
