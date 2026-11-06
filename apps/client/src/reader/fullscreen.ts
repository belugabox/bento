import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';

// Safari (iPad) n'a que les versions préfixées.
type FullscreenDocument = Document & {
    webkitFullscreenEnabled?: boolean;
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
};

const doc = () => document as FullscreenDocument;

const fullscreenElement = () =>
    doc().fullscreenElement ?? doc().webkitFullscreenElement ?? null;

/** Le navigateur sait mettre la page en plein écran (pas l'iPhone). */
export const fullscreenSupported = () =>
    !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);

const enter = async () => {
    const root = document.documentElement as FullscreenElement;
    // Le navigateur refuse sans geste de la personne : sans conséquence.
    try {
        if (root.requestFullscreen) {
            await root.requestFullscreen({ navigationUI: 'hide' });
        } else {
            await root.webkitRequestFullscreen?.();
        }
    } catch {
        // Refusé : la lecture continue sans plein écran.
    }
};

/** Quitte le plein écran (en quittant le lecteur). */
export const exitFullscreen = async () => {
    if (!fullscreenElement()) return;
    try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await doc().webkitExitFullscreen?.();
    } catch {
        // Déjà sorti.
    }
};

/**
 * Plein écran du lecteur : sans barre du navigateur ni barre d'état. Avec
 * `auto`, il démarre au premier geste dans le lecteur (le navigateur
 * l'exige), sauf si la personne vient d'en sortir. La page du lecteur le
 * quitte avec `exitFullscreen` : il continue d'un tome au suivant.
 */
export const useFullscreen = () => {
    const supported = fullscreenSupported();
    const [active, setActive] = useState(() => !!fullscreenElement());
    const [auto, setAuto] = useLocalStorage({
        key: 'bento:reader:fullscreen',
        defaultValue: false,
        getInitialValueInEffect: false,
    });

    // Sorti du plein écran (retour, Échap) : ne pas y revenir tout seul.
    const left = useRef(false);

    useEffect(() => {
        const update = () => {
            const now = !!fullscreenElement();
            if (!now) left.current = true;
            setActive(now);
        };
        document.addEventListener('fullscreenchange', update);
        document.addEventListener('webkitfullscreenchange', update);
        return () => {
            document.removeEventListener('fullscreenchange', update);
            document.removeEventListener('webkitfullscreenchange', update);
        };
    }, []);

    useEffect(() => {
        if (!supported || !auto || active || left.current) return;
        const start = () => void enter();
        window.addEventListener('pointerup', start, { once: true });
        window.addEventListener('keydown', start, { once: true });
        return () => {
            window.removeEventListener('pointerup', start);
            window.removeEventListener('keydown', start);
        };
    }, [supported, auto, active]);

    const toggle = useCallback(
        () => void (fullscreenElement() ? exitFullscreen() : enter()),
        [],
    );

    return { supported, active, toggle, auto, setAuto };
};
