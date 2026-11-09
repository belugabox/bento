import {
    ActionIcon,
    Button,
    CopyButton,
    Group,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import {
    IconBrandWhatsapp,
    IconCheck,
    IconCopy,
    IconMail,
    IconMessage,
    IconShare,
} from '@tabler/icons-react';

import { LINK_DAYS } from './links';

/**
 * Envoi d'un lien : menu de partage du téléphone, WhatsApp, texto, e-mail,
 * ou copie. Bento n'envoie rien lui-même.
 */
export const ShareLink = ({
    url,
    message,
}: {
    url: string;
    /** Texte avant le lien (« Je t'invite sur Bento… »). */
    message: string;
}) => {
    const text = `${message} ${url}`;
    const encoded = encodeURIComponent(text);
    const canShare = typeof navigator.share === 'function';

    return (
        <Stack gap="sm">
            <TextInput
                readOnly
                value={url}
                aria-label="Lien"
                onFocus={(event) => event.currentTarget.select()}
                rightSection={
                    <CopyButton value={url}>
                        {({ copied, copy }) => (
                            <Tooltip label={copied ? 'Copié' : 'Copier'}>
                                <ActionIcon
                                    variant="subtle"
                                    color={copied ? 'teal' : 'gray'}
                                    onClick={copy}
                                    aria-label="Copier le lien"
                                >
                                    {copied ? (
                                        <IconCheck size={16} />
                                    ) : (
                                        <IconCopy size={16} />
                                    )}
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>
                }
            />
            <Group gap="xs">
                {canShare && (
                    <Button
                        leftSection={<IconShare size={16} />}
                        onClick={() =>
                            void navigator
                                .share({ title: 'Bento', text: message, url })
                                .catch(() => {})
                        }
                    >
                        Partager…
                    </Button>
                )}
                <Button
                    component="a"
                    href={`https://wa.me/?text=${encoded}`}
                    target="_blank"
                    rel="noreferrer"
                    variant="light"
                    leftSection={<IconBrandWhatsapp size={16} />}
                >
                    WhatsApp
                </Button>
                <Button
                    component="a"
                    href={`sms:?&body=${encoded}`}
                    variant="light"
                    leftSection={<IconMessage size={16} />}
                >
                    Texto
                </Button>
                <Button
                    component="a"
                    href={`mailto:?subject=${encodeURIComponent('Bento')}&body=${encoded}`}
                    variant="light"
                    leftSection={<IconMail size={16} />}
                >
                    E-mail
                </Button>
            </Group>
            <Text size="xs" c="dimmed">
                Valable {LINK_DAYS} jours, une seule fois.
            </Text>
        </Stack>
    );
};
