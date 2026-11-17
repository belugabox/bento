import {
    Alert,
    Button,
    Group,
    Modal,
    SegmentedControl,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { useState } from 'react';

import { UserAvatar } from '@/components/accounts/UserAvatar';
import {
    ageLimitLabel,
    ageLimitOptions,
    useAgeSteps,
} from '@/components/ageLimits';
import { switchView } from '@/components/switchView';
import {
    fetchSimulableAccounts,
    startPreview,
    startSimulation,
} from '@/services/api';
import { useCurrentUser } from '@/services/auth';
import { useQuery } from '@/services/useQuery';

// Valeur du choix « Sans limite » (Select n'accepte pas de valeur vide).
const NO_LIMIT = 'none';

type PreviewMode = 'account' | 'age';

/**
 * « Voir comme un lecteur » (admin) : un compte simulé, vu tel quel en
 * lecture seule, ou un lecteur fictif d'un âge donné.
 */
export const PreviewModal = ({
    opened,
    onClose,
}: {
    opened: boolean;
    onClose: () => void;
}) => {
    const { preview } = useCurrentUser();
    const ages = useAgeSteps(opened);
    const { data: accounts } = useQuery(
        () => (opened ? fetchSimulableAccounts() : Promise.resolve(undefined)),
        [opened],
    );
    // Âge proposé : celui de la vue en cours (gardé même s'il a quitté la
    // grille), sinon l'âge de la grille le plus proche de 10 ans.
    const childAge = [...ages].reverse().find((age) => age <= 10) ?? ages[0];
    const [chosenAge, setChosenAge] = useState<string>();
    const [chosenAccount, setChosenAccount] = useState<string>();
    const [chosenMode, setChosenMode] = useState<PreviewMode>();
    const mode: PreviewMode =
        chosenMode ??
        (preview && !preview.user
            ? 'age'
            : accounts?.length === 0
              ? 'age'
              : 'account');
    const maxAge =
        chosenAge ??
        (preview && !preview.user
            ? String(preview.maxAge ?? NO_LIMIT)
            : String(childAge ?? NO_LIMIT));
    const accountId =
        chosenAccount ??
        (preview?.user ? String(preview.user.id) : undefined) ??
        (accounts?.[0] ? String(accounts[0].id) : undefined);
    const account = accounts?.find((a) => String(a.id) === accountId);
    const options = ageLimitOptions(ages, preview?.maxAge).map((limit) => ({
        value: String(limit.value ?? NO_LIMIT),
        label: limit.label,
    }));

    const show = () =>
        void switchView(() =>
            mode === 'account'
                ? startSimulation(Number(accountId))
                : startPreview(maxAge === NO_LIMIT ? null : Number(maxAge)),
        );

    return (
        <Modal opened={opened} onClose={onClose} title="Voir comme un lecteur">
            <Stack>
                <SegmentedControl
                    value={mode}
                    onChange={(value) => setChosenMode(value as PreviewMode)}
                    data={[
                        { value: 'account', label: 'Un compte' },
                        { value: 'age', label: 'Un âge' },
                    ]}
                    aria-label="Voir comme"
                />
                {mode === 'account' ? (
                    <>
                        <Text size="sm" c="dimmed">
                            L’appli s’affiche comme pour cette personne : ses
                            séries, ses lectures, sa liste « À lire ». En
                            lecture seule : rien n’est enregistré.
                        </Text>
                        {accounts?.length === 0 ? (
                            <Alert color="gray">Aucun compte lecteur.</Alert>
                        ) : (
                            <Select
                                label="Compte"
                                allowDeselect={false}
                                value={accountId ?? null}
                                onChange={(value) =>
                                    value && setChosenAccount(value)
                                }
                                placeholder={
                                    accounts ? undefined : 'Chargement…'
                                }
                                leftSection={
                                    account && (
                                        <UserAvatar
                                            name={account.name}
                                            seed={account.avatarSeed}
                                            size={22}
                                        />
                                    )
                                }
                                data={(accounts ?? []).map((a) => ({
                                    value: String(a.id),
                                    label: `${a.name} · ${ageLimitLabel(a.maxAge).toLowerCase()}`,
                                }))}
                                renderOption={({ option }) => {
                                    const a = accounts?.find(
                                        (item) =>
                                            String(item.id) === option.value,
                                    );
                                    return (
                                        <Group gap="sm" wrap="nowrap">
                                            {a && (
                                                <UserAvatar
                                                    name={a.name}
                                                    seed={a.avatarSeed}
                                                    size={24}
                                                />
                                            )}
                                            <Text size="sm">
                                                {option.label}
                                            </Text>
                                        </Group>
                                    );
                                }}
                            />
                        )}
                    </>
                ) : (
                    <>
                        <Text size="sm" c="dimmed">
                            L’appli s’affiche comme pour un lecteur de cet âge :
                            séries filtrées, écrans d’administration masqués.
                        </Text>
                        <Select
                            label="Séries visibles"
                            allowDeselect={false}
                            value={maxAge}
                            onChange={(value) => value && setChosenAge(value)}
                            data={options}
                        />
                    </>
                )}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        disabled={mode === 'account' && !account}
                        onClick={show}
                    >
                        Voir
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
