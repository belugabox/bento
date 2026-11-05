import { Alert, Button, Center, Stack, Title } from '@mantine/core';
import { useSearchParams } from 'react-router';

import { loginUrl } from '@/services/api';

const REASONS: Record<string, string> = {
    group: "Ton compte n'a pas accès à Bento. Demande à un administrateur de t'ajouter au groupe des lecteurs dans Pocket ID.",
    cancelled: 'La connexion a été annulée.',
    expired: 'La connexion a pris trop de temps ou a été interrompue.',
    failed: 'Pocket ID n’a pas pu confirmer ton identité.',
};

/** Explication d'une connexion refusée ou échouée (page publique). */
export const DeniedPage = () => {
    const reason = useSearchParams()[0].get('reason') ?? 'failed';

    return (
        <Center mih="100dvh" p="md">
            <Stack align="center" maw={420}>
                <Title order={2}>🍱 Bento</Title>
                <Alert color={reason === 'group' ? 'orange' : 'red'}>
                    {REASONS[reason] ?? REASONS.failed}
                </Alert>
                <Button component="a" href={loginUrl('/')}>
                    Réessayer
                </Button>
            </Stack>
        </Center>
    );
};
