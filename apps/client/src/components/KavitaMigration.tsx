import {
    Alert,
    Anchor,
    Button,
    Checkbox,
    FileInput,
    Group,
    List,
    Loader,
    Paper,
    Select,
    Spoiler,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import { IconDatabaseImport, IconTrash, IconUpload } from '@tabler/icons-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { ageLimitOptions, useAgeSteps } from '@/components/ageLimits';
import { formatNumber } from '@/components/format';
import {
    type KavitaAnalysis,
    applyKavita,
    clearKavita,
    fetchKavitaMigration,
    fetchUsers,
    uploadKavita,
} from '@/services/api';
import { useQuery } from '@/services/useQuery';

// Choix « Séries visibles » sans limite (Select n'accepte pas de vide).
const NO_LIMIT = 'none';

type Account = KavitaAnalysis['accounts'][number];

/** Choix pour un compte Kavita : « create », « skip » ou « link:12 ». */
type Choice = { action: string; maxAge: number | null };

const defaultChoice = (account: Account): Choice => ({
    action: account.suggestedUserId
        ? `link:${account.suggestedUserId}`
        : 'create',
    maxAge: account.maxAge,
});

const hours = (value: number) =>
    `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;

const Section = ({
    title,
    description,
    children,
}: {
    title: string;
    description?: ReactNode;
    children: ReactNode;
}) => (
    <Paper withBorder p="md" radius="md">
        <Stack gap="md">
            <div>
                <Text fw={600}>{title}</Text>
                {description && (
                    <Text size="sm" c="dimmed">
                        {description}
                    </Text>
                )}
            </div>
            {children}
        </Stack>
    </Paper>
);

type Report = Awaited<ReturnType<typeof applyKavita>>;

const ReportAlert = ({ report }: { report: Report }) => (
    <Alert color="teal" title="Migration faite">
        <List size="sm" spacing={2}>
            <List.Item>
                {report.accountsCreated} compte
                {report.accountsCreated > 1 ? 's' : ''} créé
                {report.accountsCreated > 1 ? 's' : ''}
                {report.accountsCreated > 0 && (
                    <>
                        {' '}
                        (à activer : envoie un lien depuis{' '}
                        <Anchor component={Link} to="/users" size="sm">
                            Comptes
                        </Anchor>
                        )
                    </>
                )}
            </List.Item>
            <List.Item>
                {formatNumber(report.progress)} lectures reprises
                {report.progressKept > 0 &&
                    `, ${formatNumber(report.progressKept)} gardées (plus récentes dans Bento)`}
            </List.Item>
            <List.Item>
                {report.toRead} série{report.toRead > 1 ? 's' : ''} ajoutée
                {report.toRead > 1 ? 's' : ''} à « À lire »
            </List.Item>
            {report.gapsFilled > 0 && (
                <List.Item>
                    {formatNumber(report.gapsFilled)} tomes sautés marqués lus
                </List.Item>
            )}
            <List.Item>
                {formatNumber(report.addedDates)} dates d’ajout reprises
            </List.Item>
            <List.Item>
                {formatNumber(report.sessions)} séances de lecture reprises
            </List.Item>
        </List>
    </Alert>
);

/**
 * Réglages, onglet « Migration Kavita » : envoyer la base de Kavita, voir
 * ce qui en serait repris, choisir pour chaque compte, puis migrer.
 * Relançable : rien n'est repris deux fois.
 */
export const KavitaMigration = () => {
    const { data, error, reload } = useQuery(fetchKavitaMigration, []);
    const bentoUsers = useQuery(fetchUsers, []);
    const ages = useAgeSteps(true);
    const [files, setFiles] = useState<File[]>([]);
    const [analysis, setAnalysis] = useState<KavitaAnalysis | null>();
    const [choices, setChoices] = useState<Record<number, Choice>>({});
    const [addedDates, setAddedDates] = useState(true);
    const [readingTime, setReadingTime] = useState(true);
    const [estimated, setEstimated] = useState(false);
    const [fillGaps, setFillGaps] = useState(false);
    const [busy, setBusy] = useState<'upload' | 'apply' | 'clear'>();
    const [actionError, setActionError] = useState<string>();
    const [report, setReport] = useState<Report>();

    const current = analysis === undefined ? data?.analysis : analysis;

    // Nouvelle analyse : choix proposés pour chaque compte.
    useEffect(() => {
        if (!current) return;
        setChoices(
            Object.fromEntries(
                current.accounts.map((a) => [a.kavitaId, defaultChoice(a)]),
            ),
        );
    }, [current]);

    const run = async (
        kind: 'upload' | 'apply' | 'clear',
        action: () => Promise<void>,
    ) => {
        setBusy(kind);
        setActionError(undefined);
        try {
            await action();
        } catch (e) {
            setActionError((e as Error).message);
        } finally {
            setBusy(undefined);
        }
    };

    const upload = () =>
        run('upload', async () => {
            const result = await uploadKavita(files);
            setAnalysis(result.analysis);
            setReport(undefined);
            setFiles([]);
        });

    const clear = () =>
        run('clear', async () => {
            await clearKavita();
            setAnalysis(null);
            setReport(undefined);
            reload();
        });

    const migrate = () =>
        run('apply', async () => {
            if (!current) return;
            const result = await applyKavita({
                accounts: current.accounts.map((account) => {
                    const choice =
                        choices[account.kavitaId] ?? defaultChoice(account);
                    if (choice.action === 'skip') {
                        return { kavitaId: account.kavitaId, action: 'skip' };
                    }
                    if (choice.action === 'create') {
                        return {
                            kavitaId: account.kavitaId,
                            action: 'create',
                            name: account.name,
                            maxAge: choice.maxAge,
                        };
                    }
                    return {
                        kavitaId: account.kavitaId,
                        action: 'link',
                        userId: Number(choice.action.slice('link:'.length)),
                    };
                }),
                addedDates,
                readingTime,
                estimatedSessions: estimated,
                fillGaps,
            });
            setReport(result);
            bentoUsers.reload();
            // Les comptes créés sont maintenant proposés.
            setAnalysis((await fetchKavitaMigration()).analysis);
        });

    if (error) return <Alert color="red">{error.message}</Alert>;
    if (!data) return <Loader mx="auto" />;

    const estimatedCount = current?.accounts.reduce(
        (n, a) => n + a.sessions.estimated,
        0,
    );
    const skipped = current?.accounts.reduce(
        (n, a) => n + a.skipped.volumes,
        0,
    );
    const estimatedHours = current?.accounts.reduce(
        (n, a) => n + a.sessions.estimatedHours,
        0,
    );
    const ageOptions = ageLimitOptions(ages).map((limit) => ({
        value: String(limit.value ?? NO_LIMIT),
        label: limit.label,
    }));

    return (
        <Stack>
            <Section
                title="Base de Kavita"
                description={
                    <>
                        Copie <b>kavita.db</b>, <b>kavita.db-wal</b> et{' '}
                        <b>kavita.db-shm</b> depuis le dossier de configuration
                        de Kavita (arrête-le le temps de la copie). Les tomes
                        sont retrouvés par leur chemin : Kavita et Bento lisent
                        les mêmes fichiers.
                    </>
                }
            >
                <FileInput
                    label="Fichiers de Kavita"
                    placeholder="kavita.db, kavita.db-wal, kavita.db-shm"
                    multiple
                    clearable
                    accept=".db,.db-wal,.db-shm"
                    leftSection={<IconUpload size={16} />}
                    value={files}
                    onChange={setFiles}
                />
                <Group justify="space-between">
                    <Button
                        leftSection={<IconDatabaseImport size={16} />}
                        disabled={files.length === 0}
                        loading={busy === 'upload'}
                        onClick={() => void upload()}
                    >
                        Envoyer et analyser
                    </Button>
                    {current && (
                        <Button
                            variant="subtle"
                            color="red"
                            leftSection={<IconTrash size={16} />}
                            loading={busy === 'clear'}
                            onClick={() => void clear()}
                        >
                            Supprimer la base envoyée
                        </Button>
                    )}
                </Group>
            </Section>

            {actionError && <Alert color="red">{actionError}</Alert>}
            {report && <ReportAlert report={report} />}

            {current && (
                <>
                    <Section
                        title="Tomes"
                        description={`${formatNumber(current.files.matched)} tomes de Kavita sur ${formatNumber(current.files.total)} retrouvés dans Bento.`}
                    >
                        {current.files.unmatched.length > 0 && (
                            <Spoiler
                                maxHeight={0}
                                showLabel="Voir les tomes introuvables"
                                hideLabel="Masquer"
                            >
                                <Text size="xs" c="dimmed" mb={4}>
                                    Renommés ou absents de Bento : leurs
                                    lectures ne seront pas reprises
                                    {current.files.total -
                                        current.files.matched >
                                        current.files.unmatched.length &&
                                        ` (les ${current.files.unmatched.length} premiers)`}
                                    .
                                </Text>
                                <List size="xs">
                                    {current.files.unmatched.map((file) => (
                                        <List.Item key={file}>{file}</List.Item>
                                    ))}
                                </List>
                            </Spoiler>
                        )}
                    </Section>

                    <Section
                        title="Comptes"
                        description="Chaque compte Kavita est associé au compte Bento du même nom, sinon créé « à activer » (tu lui envoies ensuite un lien depuis Comptes)."
                    >
                        <Table.ScrollContainer minWidth={560}>
                            <Table verticalSpacing="xs">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Kavita</Table.Th>
                                        <Table.Th>Lectures</Table.Th>
                                        <Table.Th>Temps</Table.Th>
                                        <Table.Th>Dans Bento</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {current.accounts.map((account) => {
                                        const choice =
                                            choices[account.kavitaId] ??
                                            defaultChoice(account);
                                        const set = (
                                            changes: Partial<Choice>,
                                        ) =>
                                            setChoices((all) => ({
                                                ...all,
                                                [account.kavitaId]: {
                                                    ...choice,
                                                    ...changes,
                                                },
                                            }));
                                        return (
                                            <Table.Tr key={account.kavitaId}>
                                                <Table.Td>
                                                    {account.name}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm">
                                                        {account.completed} lus
                                                        · {account.inProgress}{' '}
                                                        en cours
                                                    </Text>
                                                    <Text size="xs" c="dimmed">
                                                        {account.matched}{' '}
                                                        retrouvés
                                                    </Text>
                                                    {account.skipped.volumes >
                                                        0 && (
                                                        <Text
                                                            size="xs"
                                                            c="dimmed"
                                                        >
                                                            {
                                                                account.skipped
                                                                    .volumes
                                                            }{' '}
                                                            sautés
                                                        </Text>
                                                    )}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm">
                                                        {hours(
                                                            account.sessions
                                                                .measuredHours,
                                                        )}
                                                    </Text>
                                                    {account.sessions
                                                        .estimated > 0 && (
                                                        <Text
                                                            size="xs"
                                                            c="dimmed"
                                                        >
                                                            +{' '}
                                                            {hours(
                                                                account.sessions
                                                                    .estimatedHours,
                                                            )}{' '}
                                                            estimées
                                                        </Text>
                                                    )}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Stack gap={4}>
                                                        <Select
                                                            size="xs"
                                                            aria-label={`Compte Bento pour ${account.name}`}
                                                            allowDeselect={
                                                                false
                                                            }
                                                            value={
                                                                choice.action
                                                            }
                                                            onChange={(value) =>
                                                                value &&
                                                                set({
                                                                    action: value,
                                                                })
                                                            }
                                                            data={[
                                                                {
                                                                    value: 'create',
                                                                    label: `Créer « ${account.name} » (à activer)`,
                                                                },
                                                                ...(
                                                                    bentoUsers.data ??
                                                                    []
                                                                ).map((u) => ({
                                                                    value: `link:${u.id}`,
                                                                    label: `Associer à ${u.name}`,
                                                                })),
                                                                {
                                                                    value: 'skip',
                                                                    label: 'Ignorer',
                                                                },
                                                            ]}
                                                        />
                                                        {choice.action ===
                                                            'create' && (
                                                            <Select
                                                                size="xs"
                                                                aria-label={`Séries visibles pour ${account.name}`}
                                                                allowDeselect={
                                                                    false
                                                                }
                                                                value={String(
                                                                    choice.maxAge ??
                                                                        NO_LIMIT,
                                                                )}
                                                                onChange={(
                                                                    value,
                                                                ) =>
                                                                    value &&
                                                                    set({
                                                                        maxAge:
                                                                            value ===
                                                                            NO_LIMIT
                                                                                ? null
                                                                                : Number(
                                                                                      value,
                                                                                  ),
                                                                    })
                                                                }
                                                                data={
                                                                    ageOptions
                                                                }
                                                            />
                                                        )}
                                                    </Stack>
                                                </Table.Td>
                                            </Table.Tr>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Section>

                    <Section title="À reprendre aussi">
                        <Text size="sm" c="dimmed">
                            Toujours repris : la progression (la plus récente
                            gagne) et « Want to read », qui devient « À lire ».
                        </Text>
                        <Checkbox
                            label="Dates d’ajout"
                            description={`${formatNumber(current.olderDates)} tomes prennent leur date d’ajout dans Kavita, plus ancienne (tri « ajouts récents »).`}
                            checked={addedDates}
                            onChange={(e) =>
                                setAddedDates(e.currentTarget.checked)
                            }
                        />
                        {skipped !== undefined && skipped > 0 && (
                            <Checkbox
                                label="Tomes sautés marqués lus"
                                description={`${formatNumber(skipped)} tomes jamais ouverts ou pas finis dans Kavita, mais placés avant le dernier tome fini de leur série (par exemple les premiers tomes lus ailleurs).`}
                                checked={fillGaps}
                                onChange={(e) =>
                                    setFillGaps(e.currentTarget.checked)
                                }
                            />
                        )}
                        <Checkbox
                            label="Temps de lecture"
                            description="Les séances de lecture de Kavita, pour le temps de lecture des statistiques."
                            checked={readingTime}
                            onChange={(e) =>
                                setReadingTime(e.currentTarget.checked)
                            }
                        />
                        {estimatedCount !== undefined && estimatedCount > 0 && (
                            <Checkbox
                                ml="xl"
                                label="Avec les séances estimées"
                                description={`${estimatedCount} séances (${hours(estimatedHours ?? 0)}) commencent à minuit pile et durent environ une heure : Kavita les a reconstituées, sans vraie mesure.`}
                                disabled={!readingTime}
                                checked={estimated && readingTime}
                                onChange={(e) =>
                                    setEstimated(e.currentTarget.checked)
                                }
                            />
                        )}
                    </Section>

                    <Group justify="flex-end">
                        <Button
                            leftSection={<IconDatabaseImport size={16} />}
                            loading={busy === 'apply'}
                            onClick={() => void migrate()}
                        >
                            Migrer
                        </Button>
                    </Group>
                </>
            )}
        </Stack>
    );
};
