import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// DiceBear n'est publié qu'en modules ES : chargé par `require` (Node 22),
// le style « Clay » (licence CC0) étant lu comme un simple fichier JSON.
const load = createRequire(__filename);

type DiceBear = typeof import('@dicebear/core');

let style: InstanceType<DiceBear['Style']> | undefined;
const dicebear = () => load('@dicebear/core') as DiceBear;

// Fonds pastel, choisis par la graine comme le reste de l'avatar.
const BACKGROUNDS = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'];

/** Avatar DiceBear « Clay » de cette graine, en SVG. */
export const avatarSvg = (seed: string) => {
    const { Avatar, Style } = dicebear();
    style ??= new Style(
        JSON.parse(
            readFileSync(load.resolve('@dicebear/styles/clay.json'), 'utf-8'),
        ),
    );
    return new Avatar(style, {
        seed,
        backgroundColor: BACKGROUNDS,
    }).toString();
};
