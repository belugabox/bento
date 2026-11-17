import { Box, UnstyledButton } from '@mantine/core';

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

/**
 * Va à la première série d'une lettre (repère `data-letter`), sous
 * l'en-tête et la barre d'outils collée en haut.
 */
const jumpToLetter = (letter: string) => {
    const target = document.querySelector<HTMLElement>(
        `[data-letter="${letter}"]`,
    );
    if (!target) return;
    const header =
        document
            .querySelector<HTMLElement>('[data-library-toolbar]')
            ?.getBoundingClientRect().bottom ?? 56;
    window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - header - 8,
    });
};

/**
 * Index A–Z sur le bord droit (tablette, ordinateur), quand la
 * bibliothèque est triée par nom : un toucher va à la lettre. Les lettres
 * sans série sont grisées.
 */
export const AlphabetIndex = ({ letters }: { letters: Set<string> }) => (
    <Box
        component="nav"
        aria-label="Index alphabétique"
        visibleFrom="sm"
        style={{
            position: 'fixed',
            right: 'max(2px, env(safe-area-inset-right, 0px))',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
        }}
    >
        {LETTERS.map((letter) => (
            <UnstyledButton
                key={letter}
                disabled={!letters.has(letter)}
                onClick={() => jumpToLetter(letter)}
                aria-label={`Lettre ${letter}`}
                fz={11}
                fw={700}
                lh="17px"
                w={22}
                ta="center"
                c={
                    letters.has(letter)
                        ? 'var(--mantine-primary-color-light-color)'
                        : 'var(--mantine-color-default-border)'
                }
            >
                {letter}
            </UnstyledButton>
        ))}
    </Box>
);
