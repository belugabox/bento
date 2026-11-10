import { Alert, Button, Center, Loader, Text } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { volumeLabel } from '@/components/readingStatus';
import { saveLocalProgress, useDownloads } from '@/offline/downloads';
import { loadPageSizes, loadVolume } from '@/offline/reading';
import { saveProgressOrQueue } from '@/offline/syncQueue';
import { pageUrl, saveProgress, screenPageWidth } from '@/services/api';
import { UserContext, useReadOnly } from '@/services/auth';
import { useOnline } from '@/services/network';
import { useQuery } from '@/services/useQuery';

import { Reader } from './Reader';
import { exitFullscreen } from './fullscreen';
import { type ReadingMode, clampPage } from './navigation';
import { useReadingTime } from './readingTime';

// `?page=last` : dernière page (en revenant du tome suivant).
const LAST_PAGE = 'last';

// Pages à voir avant d'enregistrer quoi que ce soit : ouvrir un tome, ou
// arriver sur sa dernière page depuis le suivant, ne le commence ni ne le
// termine.
const PAGES_BEFORE_SAVE = 3;

/** Lecteur plein écran d'un tome de la bibliothèque. */
export const ReaderPage = () => {
    const volumeId = Number(useParams().id);
    const readOnly = useReadOnly();
    const userId = useContext(UserContext)?.id;
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    // Sans réseau : la fiche du tome téléchargé.
    const { data, error } = useQuery(() => loadVolume(volumeId), [volumeId]);
    const online = useOnline();
    const { downloads } = useDownloads();
    // Tome précédent encore en mémoire pendant le chargement du suivant :
    // l'ignorer, sinon sa page (et son défilement) passent au nouveau tome.
    const volume = data?.id === volumeId ? data : undefined;
    // Mode de lecture réglable par série ; par défaut celui de la série.
    const [modes, setModes] = useLocalStorage<Record<string, ReadingMode>>({
        key: 'bento:reader:modes',
        defaultValue: {},
    });

    const pageCount = volume?.pageCount ?? 0;
    const rawPage = params.get('page');
    // Sans page dans l'adresse : reprendre là où la personne s'était arrêtée.
    const resumePage =
        volume?.progress && !volume.progress.completed
            ? volume.progress.page
            : 0;
    const page =
        rawPage === LAST_PAGE
            ? pageCount - 1
            : rawPage === null
              ? clampPage(resumePage, pageCount)
              : clampPage(Number(rawPage) - 1, pageCount);

    const goTo = useCallback(
        (next: number) =>
            // Page affichée en partant de 1 dans l'adresse.
            setParams({ page: String(next + 1) }, { replace: true }),
        [setParams],
    );

    // Quitter le lecteur quitte le plein écran (pas le tome suivant).
    useEffect(() => () => void exitFullscreen(), []);

    // L'adresse garde toujours un numéro de page (reprise après rechargement).
    useEffect(() => {
        if (volume && (rawPage === LAST_PAGE || rawPage === null)) goTo(page);
    }, [volume, rawPage, page, goTo]);

    // Enregistrer chaque page atteinte (une fois l'adresse fixée), après
    // quelques pages vues dans ce tome.
    const savedPage = useRef<string>(undefined);
    const seen = useRef({ volumeId: 0, pages: new Set<number>() });
    const urlReady = !!volume && rawPage !== null && rawPage !== LAST_PAGE;
    // Temps de lecture (statistiques), sauf en simulation d'un compte.
    const readingActivity = useReadingTime(volume?.id, !readOnly);
    const onShown = useCallback(
        (shown: number[]) => {
            if (!volume || !urlReady) return;
            if (seen.current.volumeId !== volume.id) {
                seen.current = { volumeId: volume.id, pages: new Set() };
            }
            const before = seen.current.pages.size;
            for (const page of shown) seen.current.pages.add(page);
            readingActivity(seen.current.pages.size - before);
            const lastShown = Math.max(...shown);
            const needed = Math.min(PAGES_BEFORE_SAVE, volume.pageCount);
            if (seen.current.pages.size < needed) return;
            const key = `${volume.id}:${lastShown}`;
            if (savedPage.current === key) return;
            savedPage.current = key;
            // Simulation d'un compte : rien n'est enregistré.
            if (readOnly) return;
            // Tome téléchargé : sa lecture est aussi gardée sur l'appareil.
            void saveLocalProgress(volume.id, {
                page: lastShown,
                completed: lastShown >= volume.pageCount - 1,
            });
            // Sans réseau : gardée sur l'appareil, envoyée au retour du réseau.
            const save = userId
                ? saveProgressOrQueue(userId, volume.id, { page: lastShown })
                : saveProgress(volume.id, { page: lastShown });
            save.catch(() => {
                // Refusée : la page suivante réessaiera.
                savedPage.current = undefined;
            });
        },
        [volume, urlReady, readOnly, readingActivity, userId],
    );

    const pageSrc = useCallback(
        // Réduite à la largeur de l'écran : trois fois plus légère.
        (index: number) =>
            pageUrl(volumeId, volume?.version ?? 0, index, screenPageWidth()),
        [volumeId, volume?.version],
    );
    const loadSizes = useCallback(() => loadPageSizes(volumeId), [volumeId]);
    const onBeforeFirst = useCallback(() => {
        if (volume?.previousId) {
            navigate(`/read/${volume.previousId}?page=${LAST_PAGE}`);
        }
    }, [volume, navigate]);

    if (error) {
        return (
            <Center h="100dvh" p="md">
                <Alert color="red">{error.message}</Alert>
            </Center>
        );
    }
    if (!volume) {
        return (
            <Center h="100dvh">
                <Loader />
            </Center>
        );
    }

    const seriesUrl = `/series/${volume.seriesId}`;
    return (
        <Reader
            title={`${volume.seriesName} — ${volumeLabel(volume)}`}
            pageCount={pageCount}
            pageSrc={pageSrc}
            loadSizes={loadSizes}
            sizesKey={String(volume.id)}
            page={page}
            goTo={goTo}
            onShown={onShown}
            onBeforeFirst={onBeforeFirst}
            mode={modes[volume.seriesId] ?? volume.readingMode ?? 'ltr'}
            onModeChange={(mode) =>
                setModes((current) => ({
                    ...current,
                    [volume.seriesId]: mode,
                }))
            }
            modeLabel="Mode de lecture (cette série)"
            exit={{
                to: seriesUrl,
                onExit: () => navigate(seriesUrl),
                label: 'Retour à la série',
            }}
            end={
                <>
                    {volume.nextId &&
                    !online &&
                    !downloads.some((d) => d.id === volume.nextId) ? (
                        <Text c="dimmed" size="sm">
                            Tome suivant pas téléchargé
                        </Text>
                    ) : volume.nextId ? (
                        <Button component={Link} to={`/read/${volume.nextId}`}>
                            Tome suivant
                        </Button>
                    ) : (
                        <Text c="dimmed" size="sm">
                            Dernier tome de la série
                        </Text>
                    )}
                    <Button variant="default" component={Link} to={seriesUrl}>
                        Retour à la série
                    </Button>
                </>
            }
        />
    );
};
