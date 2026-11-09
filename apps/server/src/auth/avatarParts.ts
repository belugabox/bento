// Avatar DiceBear « Clay » composé à la main, partagé avec le client (sans
// Node). Un avatar est soit une graine au hasard (comptes d'avant), soit un
// avatar composé, écrit dans la même colonne et la même adresse :
// « c1_corps_sommet_motif_yeux_bouche_couleur_détails_fond_mouvement ».

/** Variantes du style Clay (`@dicebear/styles` 10.6, vérifiées par un test). */
export const AVATAR_VARIANTS = {
    body: [
        'pear',
        'boulder',
        'loaf',
        'column',
        'stack',
        'gumdrop',
        'dollop',
        'slug',
        'egg',
        'blob',
        'bell',
        'cube',
        'squat',
        'lean',
    ],
    top: [
        'horns',
        'nub',
        'curl',
        'spikes',
        'antenna',
        'loop',
        'peak',
        'ears',
        'crest',
        'swirl',
        'pellet',
        'hornsSmall',
        'tuft',
    ],
    pattern: [
        'spiral',
        'prints',
        'pellets',
        'buttons',
        'stitches',
        'patch',
        'coil',
        'freckles',
        'checker',
        'zig',
    ],
    eyes: [
        'googly',
        'even',
        'big',
        'tiny',
        'mono',
        'trio',
        'side',
        'outward',
        'inward',
        'dots',
        'happy',
        'wink',
        'down',
        'up',
        'pinprick',
    ],
    mouth: [
        'teeth',
        'smile',
        'o',
        'frown',
        'line',
        'wavy',
        'open',
        'toothy',
        'tongue',
        'pout',
        'grin',
        'smirk',
        'zigzag',
        'dot',
        'laugh',
        'cat',
        'smileBig',
        'uu',
        'openSmall',
        'smileTongue',
    ],
} as const;

/** Couleurs du corps et des détails (celles du style Clay). */
export const AVATAR_BODY_COLORS = [
    'c4795c',
    'd99277',
    'e0bd6a',
    'cf9f52',
    'a8b37e',
    '8ba06b',
    '83b0a4',
    '86a5c3',
    '9793bd',
    'ab8bbd',
    'cd8ea6',
    'b3a696',
] as const;

/** Fonds : les cinq pastel des avatars au hasard, puis quelques autres. */
export const AVATAR_BACKGROUNDS = [
    'b6e3f4',
    'c0aede',
    'd1d4f9',
    'ffd5dc',
    'ffdfbf',
    'c8ecd4',
    'fbf0b2',
    'f4e8d4',
    'e8edf0',
    '3f3f46',
] as const;

/** Mouvement (respecte « réduire les animations » du système). */
export const AVATAR_MOTIONS = ['none', 'slow', 'medium', 'fast'] as const;

type Of<T extends readonly string[]> = T[number];

export type AvatarChoice = {
    body: Of<typeof AVATAR_VARIANTS.body>;
    top: Of<typeof AVATAR_VARIANTS.top> | null;
    pattern: Of<typeof AVATAR_VARIANTS.pattern> | null;
    eyes: Of<typeof AVATAR_VARIANTS.eyes>;
    mouth: Of<typeof AVATAR_VARIANTS.mouth>;
    bodyColor: Of<typeof AVATAR_BODY_COLORS>;
    accentColor: Of<typeof AVATAR_BODY_COLORS>;
    background: Of<typeof AVATAR_BACKGROUNDS>;
    motion: Of<typeof AVATAR_MOTIONS>;
};

const PREFIX = 'c1';
const NONE = 'none';

/** Avatar composé, tel qu'écrit dans la base et dans l'adresse. */
export const formatAvatar = (choice: AvatarChoice) =>
    [
        PREFIX,
        choice.body,
        choice.top ?? NONE,
        choice.pattern ?? NONE,
        choice.eyes,
        choice.mouth,
        choice.bodyColor,
        choice.accentColor,
        choice.background,
        choice.motion,
    ].join('_');

const pick = <T extends string>(
    list: readonly T[],
    value: string | undefined,
) => list.find((item) => item === value);

const optional = <T extends string>(
    list: readonly T[],
    value: string | undefined,
): T | null | undefined => (value === NONE ? null : pick(list, value));

/** Avatar composé lu ; `undefined` pour une graine ou un texte invalide. */
export const parseAvatar = (value: string): AvatarChoice | undefined => {
    const parts = value.split('_');
    if (parts.length !== 10 || parts[0] !== PREFIX) return undefined;
    const [, body, top, pattern, eyes, mouth, bodyColor, accent, bg, motion] =
        parts;
    const choice = {
        body: pick(AVATAR_VARIANTS.body, body),
        top: optional(AVATAR_VARIANTS.top, top),
        pattern: optional(AVATAR_VARIANTS.pattern, pattern),
        eyes: pick(AVATAR_VARIANTS.eyes, eyes),
        mouth: pick(AVATAR_VARIANTS.mouth, mouth),
        bodyColor: pick(AVATAR_BODY_COLORS, bodyColor),
        accentColor: pick(AVATAR_BODY_COLORS, accent),
        background: pick(AVATAR_BACKGROUNDS, bg),
        motion: pick(AVATAR_MOTIONS, motion),
    };
    return Object.values(choice).some((part) => part === undefined)
        ? undefined
        : (choice as AvatarChoice);
};

const any = <T>(list: readonly T[], random: () => number) =>
    list[Math.floor(random() * list.length)]!;

/**
 * Avatar composé au hasard, immobile, avec ou sans sommet et motif comme le
 * style Clay (75 % et 55 % des cas), sur un fond pastel.
 */
export const randomAvatar = (random = Math.random): AvatarChoice => {
    const bodyColor = any(AVATAR_BODY_COLORS, random);
    return {
        body: any(AVATAR_VARIANTS.body, random),
        top: random() < 0.75 ? any(AVATAR_VARIANTS.top, random) : null,
        pattern: random() < 0.55 ? any(AVATAR_VARIANTS.pattern, random) : null,
        eyes: any(AVATAR_VARIANTS.eyes, random),
        mouth: any(AVATAR_VARIANTS.mouth, random),
        bodyColor,
        accentColor: any(
            AVATAR_BODY_COLORS.filter((color) => color !== bodyColor),
            random,
        ),
        background: any(AVATAR_BACKGROUNDS.slice(0, 5), random),
        motion: 'none',
    };
};
