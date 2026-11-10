import { Alert } from '@mantine/core';
import { IconWifiOff } from '@tabler/icons-react';

import { useOnline } from '@/services/network';

/** Bandeau discret tant que le réseau manque. */
export const OfflineBanner = () =>
    useOnline() ? null : (
        <Alert
            color="gray"
            variant="light"
            mb="md"
            icon={<IconWifiOff size={18} />}
            role="status"
        >
            Hors ligne : seuls les tomes téléchargés se lisent. Ta lecture sera
            envoyée au retour du réseau.
        </Alert>
    );
