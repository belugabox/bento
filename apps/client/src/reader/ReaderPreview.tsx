import { Box, Button, Portal } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { Reader } from './Reader';
import { type ReadingMode, readingModeLabel } from './navigation';

/**
 * Aperçu d'un tome dans le lecteur, par-dessus la page (l'éditeur garde ses
 * modifications) : pour essayer un mode de lecture avant de le choisir.
 */
export const ReaderPreview = ({
    title,
    pageCount,
    pageSrc,
    loadSizes,
    sizesKey,
    mode: initialMode,
    onKeepMode,
    onClose,
}: {
    title: string;
    pageCount: number;
    pageSrc: (index: number) => string;
    loadSizes: () => Promise<[number, number][]>;
    sizesKey: string;
    mode: ReadingMode;
    /** Garder le mode essayé pour la série (non enregistré). */
    onKeepMode?: (mode: ReadingMode) => void;
    onClose: () => void;
}) => {
    const [page, setPage] = useState(0);
    const [mode, setMode] = useState(initialMode);

    // La page dessous ne défile plus pendant l'aperçu.
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    return (
        <Portal>
            <Box
                pos="fixed"
                inset={0}
                // Sous les menus du lecteur (300), au-dessus de la page.
                style={{ zIndex: 250, overflow: 'auto' }}
                role="dialog"
                aria-label={`Aperçu : ${title}`}
            >
                <Reader
                    title={`Aperçu — ${title}`}
                    pageCount={pageCount}
                    pageSrc={pageSrc}
                    loadSizes={loadSizes}
                    sizesKey={sizesKey}
                    page={page}
                    goTo={setPage}
                    mode={mode}
                    onModeChange={setMode}
                    modeLabel="Mode de lecture (essai)"
                    exit={{ onExit: onClose, label: 'Fermer l’aperçu' }}
                    toolbarExtra={
                        onKeepMode &&
                        mode !== initialMode && (
                            <Button
                                size="compact-sm"
                                leftSection={<IconCheck size={14} />}
                                onClick={() => {
                                    onKeepMode(mode);
                                    onClose();
                                }}
                            >
                                Garder « {readingModeLabel(mode)} »
                            </Button>
                        )
                    }
                    end={
                        <Button variant="default" onClick={onClose}>
                            Fermer l’aperçu
                        </Button>
                    }
                />
            </Box>
        </Portal>
    );
};
