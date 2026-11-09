import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
    AVATAR_BACKGROUNDS,
    AVATAR_BODY_COLORS,
    type AvatarChoice,
    parseAvatar,
    randomAvatar,
} from './avatarParts';

// DiceBear n'est publié qu'en modules ES : chargé par `require` (Node 22),
// le style « Clay » (licence CC0) étant lu comme un simple fichier JSON.
const load = createRequire(__filename);

type DiceBear = typeof import('@dicebear/core');

let style: InstanceType<DiceBear['Style']> | undefined;
const dicebear = () => load('@dicebear/core') as DiceBear;

/** Définition du style Clay (aussi lue par les tests). */
export const clayDefinition = () =>
    JSON.parse(
        readFileSync(load.resolve('@dicebear/styles/clay.json'), 'utf-8'),
    ) as {
        components: Record<string, { variants: Record<string, unknown> }>;
        colors: Record<string, { values: string[] }>;
    };

// Fonds pastel des avatars au hasard, choisis par la graine.
const SEED_BACKGROUNDS = AVATAR_BACKGROUNDS.slice(0, 5);

// Graine fixe des avatars composés : le motif garde sa place quand on
// change une autre partie.
const COMPOSED_SEED = 'bento';

/**
 * Réglages de tous les avatars : mouvement « normal » (sauf si l'appareil
 * réduit les animations), et dessin remonté de 8 % dans son fond. Les
 * changer change le dessin d'adresses gardées un an : changer aussi
 * `AVATAR_VERSION` côté client (`services/api.ts`).
 */
const COMMON = { animationVariant: 'medium', translateY: -8 };

const render = (options: Record<string, unknown>) => {
    const { Avatar, Style } = dicebear();
    style ??= new Style(clayDefinition());
    return new Avatar(style, { ...COMMON, ...options });
};

const composedOptions = (choice: AvatarChoice) => ({
    seed: COMPOSED_SEED,
    bodyVariant: choice.body,
    // DiceBear refuse une variante `undefined` : clé absente.
    ...(choice.top && { topVariant: choice.top }),
    topProbability: choice.top ? 100 : 0,
    ...(choice.pattern && { patternVariant: choice.pattern }),
    patternProbability: choice.pattern ? 100 : 0,
    eyesVariant: choice.eyes,
    mouthVariant: choice.mouth,
    bodyColor: `#${choice.bodyColor}`,
    accentColor: `#${choice.accentColor}`,
    backgroundColor: choice.background,
});

/** Avatar Clay en SVG : avatar composé, ou graine au hasard. */
export const avatarSvg = (value: string) => {
    const choice = parseAvatar(value);
    return render(
        choice
            ? composedOptions(choice)
            : { seed: value, backgroundColor: SEED_BACKGROUNDS },
    ).toString();
};

const hex = (color: unknown) =>
    (Array.isArray(color) ? String(color[0]) : String(color ?? ''))
        .replace('#', '')
        .toLowerCase();

const member = <T extends string>(list: readonly T[], value: unknown) =>
    list.find((item) => item === value);

/**
 * Parties d'un avatar, pour le modifier : celles d'un avatar composé, ou
 * celles qu'une graine a tirées (même dessin).
 */
export const avatarChoice = (value: string): AvatarChoice => {
    const composed = parseAvatar(value);
    if (composed) return composed;
    const options = render({
        seed: value,
        backgroundColor: SEED_BACKGROUNDS,
    }).toJSON().options as Record<string, unknown>;
    const fallback = randomAvatar(() => 0);
    const bodyColor =
        member(AVATAR_BODY_COLORS, hex(options.bodyColor)) ??
        fallback.bodyColor;
    return {
        body: (options.bodyVariant as AvatarChoice['body']) ?? fallback.body,
        top: (options.topVariant as AvatarChoice['top']) ?? null,
        pattern: (options.patternVariant as AvatarChoice['pattern']) ?? null,
        eyes: (options.eyesVariant as AvatarChoice['eyes']) ?? fallback.eyes,
        mouth:
            (options.mouthVariant as AvatarChoice['mouth']) ?? fallback.mouth,
        bodyColor,
        // Sans sommet ni motif, la graine n'a pas tiré de couleur de détails.
        accentColor:
            member(AVATAR_BODY_COLORS, hex(options.accentColor)) ??
            AVATAR_BODY_COLORS.find((color) => color !== bodyColor)!,
        background:
            member(AVATAR_BACKGROUNDS, hex(options.backgroundColor)) ??
            fallback.background,
    };
};
