import { useEffect, useState } from 'react';

/** Couleur RVB (0 à 255). */
export type Rgb = [number, number, number];

// Image réduite à cette taille pour compter ses couleurs.
const SAMPLE = 32;

/**
 * Couleur marquante d'une image (pixels RVBA à la suite) : la teinte vive la
 * plus présente (12 teintes, chaque pixel compté selon sa saturation), sans
 * les blancs, noirs et gris ; sinon, la moyenne de tous les pixels.
 */
export const dominantColor = (pixels: ArrayLike<number>): Rgb | null => {
    const buckets = Array.from({ length: 12 }, () => ({
        weight: 0,
        r: 0,
        g: 0,
        b: 0,
    }));
    const all = { count: 0, r: 0, g: 0, b: 0 };
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        const [r, g, b, a] = [
            pixels[i]!,
            pixels[i + 1]!,
            pixels[i + 2]!,
            pixels[i + 3]!,
        ];
        if (a < 128) continue;
        all.count++;
        all.r += r;
        all.g += g;
        all.b += b;
        const max = Math.max(r, g, b) / 255;
        const min = Math.min(r, g, b) / 255;
        const light = (max + min) / 2;
        const saturation =
            max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
        if (saturation < 0.25 || light < 0.15 || light > 0.85) continue;
        const hue =
            max === r / 255
                ? ((g - b) / 255 / (max - min) + 6) % 6
                : max === g / 255
                  ? (b - r) / 255 / (max - min) + 2
                  : (r - g) / 255 / (max - min) + 4;
        const bucket = buckets[Math.floor(hue * 2) % 12]!;
        bucket.weight += saturation;
        bucket.r += r * saturation;
        bucket.g += g * saturation;
        bucket.b += b * saturation;
    }
    if (all.count === 0) return null;
    const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a));
    // Peu de couleur vive (image en noir et blanc) : la moyenne.
    if (best.weight < all.count * 0.02) {
        return [all.r, all.g, all.b].map((v) =>
            Math.round(v / all.count),
        ) as Rgb;
    }
    return [best.r, best.g, best.b].map((v) =>
        Math.round(v / best.weight),
    ) as Rgb;
};

/**
 * Couleur marquante d'une couverture, calculée dans le navigateur (même
 * origine : lisible par le canevas) ; null tant qu'elle n'est pas connue.
 */
export const useCoverColor = (url: string | undefined) => {
    const [color, setColor] = useState<Rgb | null>(null);
    useEffect(() => {
        setColor(null);
        if (!url) return;
        let current = true;
        const image = new Image();
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = SAMPLE;
                canvas.height = SAMPLE;
                const context = canvas.getContext('2d');
                if (!context) return;
                context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
                const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE);
                if (current) setColor(dominantColor(data));
            } catch {
                // Pas de canevas (tests) ou image illisible : pas de couleur.
            }
        };
        image.src = url;
        return () => {
            current = false;
        };
    }, [url]);
    return color;
};

/** « rgba(…) » d'une couleur, avec son opacité. */
export const rgba = ([r, g, b]: Rgb, alpha: number) =>
    `rgba(${r}, ${g}, ${b}, ${alpha})`;
