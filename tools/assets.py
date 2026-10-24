#!/usr/bin/env python3
"""Turns the painted source art in assets/src into native-resolution pixel art and embeds it.

    python3 tools/assets.py

assets/src/*.png are large "pixel art" paintings (each art pixel is about 5 screen pixels, with soft edges and
compression noise). The game draws everything on one pixel grid, so each picture is resampled to the game's
grid, reduced to a small palette without dithering, and cleaned with the usual pixel art rules:
  * no stray pixels: a lone pixel whose colour is close to its surroundings is noise and is merged away
    (high-contrast lone pixels such as stars and sparkles are kept on purpose);
  * no holes or single-pixel spurs on sprite silhouettes, and a 1-pixel coloured outline (sel-out);
  * hard alpha (fully opaque or fully transparent).
Outputs assets/px/*.png (for review) and js/assets.js (data URLs, so the single-file build works offline).
Needs Pillow and NumPy.
"""
import base64, io, os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'src')
OUT = os.path.join(ROOT, 'assets', 'px')
BG_H = 180  # art pixels; the battlefield is ~155 art pixels tall


def quantize(rgb, colours):
    im = Image.fromarray(rgb.astype(np.uint8), 'RGB')
    q = im.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, kmeans=4, dither=Image.Dither.NONE)
    return np.asarray(q.convert('RGB')).astype(np.int32)


def neighbours(a, y, x):
    h, w = a.shape[:2]
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
        yy, xx = y + dy, x + dx
        if 0 <= yy < h and 0 <= xx < w:
            yield dy, dx, yy, xx


def despeckle(rgb, mask=None, keep_contrast=90, passes=2):
    """Merges lone pixels (no 4-connected neighbour of the same colour) into their most common neighbour colour,
    unless the pixel stands out strongly (a deliberate highlight)."""
    a = rgb.copy()
    h, w = a.shape[:2]
    key = (a[:, :, 0] << 16) | (a[:, :, 1] << 8) | a[:, :, 2]
    for _ in range(passes):
        changed = 0
        for y in range(h):
            for x in range(w):
                if mask is not None and not mask[y, x]:
                    continue
                k = key[y, x]
                same4 = 0
                counts = {}
                for dy, dx, yy, xx in neighbours(a, y, x):
                    if mask is not None and not mask[yy, xx]:
                        continue
                    kk = key[yy, xx]
                    if kk == k and (dy == 0 or dx == 0):
                        same4 += 1
                    counts[kk] = counts.get(kk, 0) + (2 if (dy == 0 or dx == 0) else 1)
                if same4 > 0 or not counts:
                    continue
                best = max(counts, key=counts.get)
                bc = np.array([(best >> 16) & 255, (best >> 8) & 255, best & 255])
                # Lone pixel brighter/darker than everything around it by a lot: a sparkle, keep it.
                if np.abs(a[y, x] - bc).sum() > keep_contrast and counts[best] < 8:
                    continue
                a[y, x] = bc
                key[y, x] = best
                changed += 1
        if not changed:
            break
    return a


def to_png(arr, alpha=None):
    if alpha is None:
        im = Image.fromarray(arr.astype(np.uint8), 'RGB')
    else:
        rgba = np.dstack([arr, alpha]).astype(np.uint8)
        im = Image.fromarray(rgba, 'RGBA')
    bio = io.BytesIO()
    im.save(bio, 'PNG', optimize=True)
    return im, bio.getvalue()


def grade(rgb, kind):
    """Colour grades used to make extra regions from the four painted backgrounds."""
    f = rgb.astype(np.float64) / 255.0
    h = f.shape[0]
    t = np.linspace(0, 1, h)[:, None, None]  # 0 top .. 1 bottom
    lum = (f * [0.3, 0.59, 0.11]).sum(axis=2, keepdims=True)
    if kind == 'bog':      # misty murky dusk
        g = lum * 0.55 + f * 0.45
        g = g * [0.62, 0.78, 0.66] + [0.04, 0.06, 0.07]
        fog = np.clip(1 - np.abs(t - 0.62) * 4, 0, 1) * 0.22
        g = g * (1 - fog) + fog * np.array([0.55, 0.62, 0.55])
    elif kind == 'caldera':  # volcanic red evening
        g = lum * 0.5 + f * 0.5
        g = g * [1.15, 0.55, 0.42] + [0.06, 0.0, 0.02]
        sky = np.clip(1 - t * 1.6, 0, 1) * 0.35
        g = g * (1 - sky) + sky * np.array([0.35, 0.08, 0.12])
    elif kind == 'city':     # cold night
        g = lum * 0.6 + f * 0.4
        g = g * [0.42, 0.45, 0.72] + [0.02, 0.02, 0.06]
    elif kind == 'sky':      # warm golden morning
        g = f * 0.75 + lum * 0.25
        g = g * [1.06, 0.98, 0.95] + [0.05, 0.03, 0.06]
        sun = np.clip(1 - t * 1.4, 0, 1) * 0.18
        g = g * (1 - sun) + sun * np.array([1.0, 0.86, 0.72])
    else:
        g = f
    return np.clip(g * 255, 0, 255)


def background(name, src, kind=None, colours=40):
    im = Image.open(os.path.join(SRC, src)).convert('RGB')
    w = round(im.width * BG_H / im.height)
    small = np.asarray(im.resize((w, BG_H), Image.Resampling.BOX)).astype(np.float64)
    if kind:
        small = grade(small, kind)
    q = quantize(small, colours)
    q = despeckle(q)
    return to_png(q)


def sprite(name, src, height, colours=36):
    im = Image.open(os.path.join(SRC, src)).convert('RGBA')
    bbox = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    im = im.crop(bbox)
    w = round(im.width * height / im.height)
    # Premultiplied box filter so transparent pixels do not bleed dark fringes.
    a = np.asarray(im).astype(np.float64) / 255.0
    pm = Image.fromarray((np.dstack([a[:, :, :3] * a[:, :, 3:], a[:, :, 3:]]) * 255).astype(np.uint8), 'RGBA')
    s = np.asarray(pm.resize((w, height), Image.Resampling.BOX)).astype(np.float64)
    alpha = s[:, :, 3]
    mask = alpha > 140
    rgb = np.where(alpha[:, :, None] > 0, s[:, :, :3] * 255.0 / np.maximum(alpha[:, :, None], 1), 0)
    # Silhouette clean-up: fill pinholes, remove spurs and lone pixels.
    for _ in range(3):
        m = mask.copy()
        hh, ww = m.shape
        for y in range(hh):
            for x in range(ww):
                n4 = sum(1 for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))
                         if 0 <= y + dy < hh and 0 <= x + dx < ww and mask[y + dy, x + dx])
                if not mask[y, x] and n4 >= 3:
                    m[y, x] = True
                elif mask[y, x] and n4 <= 1:
                    m[y, x] = False
        mask = m
    # Colour where the mask grew: take it from the nearest opaque neighbour.
    for y, x in zip(*np.where(mask & (alpha <= 140))):
        for dy, dx, yy, xx in neighbours(rgb, y, x):
            if alpha[yy, xx] > 140:
                rgb[y, x] = rgb[yy, xx]
                break
    q = quantize(np.where(mask[:, :, None], rgb, 0), colours)
    q = despeckle(q, mask, keep_contrast=140)
    # Sel-out: a 1-pixel border in a darkened version of the colour it touches.
    hh, ww = mask.shape
    out = np.zeros((hh + 2, ww + 2, 3), np.int32)
    om = np.zeros((hh + 2, ww + 2), bool)
    out[1:-1, 1:-1] = q
    om[1:-1, 1:-1] = mask
    edge = np.zeros_like(om)
    for y in range(hh + 2):
        for x in range(ww + 2):
            if om[y, x]:
                continue
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < hh + 2 and 0 <= xx < ww + 2 and om[yy, xx]:
                    c = out[yy, xx]
                    out[y, x] = (c * 0.32 + np.array([20, 12, 24]) * 0.68).astype(np.int32)
                    edge[y, x] = True
                    break
    om |= edge
    return to_png(out, np.where(om, 255, 0))


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ('bg_meadow', lambda: background('bg_meadow', 'meadow.png')),
        ('bg_dunes', lambda: background('bg_dunes', 'dunes.png')),
        ('bg_peaks', lambda: background('bg_peaks', 'peaks.png')),
        ('bg_bog', lambda: background('bg_bog', 'meadow.png', 'bog')),
        ('bg_caldera', lambda: background('bg_caldera', 'dunes.png', 'caldera')),
        ('bg_city', lambda: background('bg_city', 'rift.png', 'city')),
        ('bg_sky', lambda: background('bg_sky', 'peaks.png', 'sky')),
        ('bg_rift', lambda: background('bg_rift', 'rift.png')),
        ('base', lambda: sprite('base', 'base.png', 92)),
    ]
    lines = ['/* Animal Wars: embedded pixel art written by tools/assets.py from assets/src (do not edit by hand). */',
             '(function (root) {', "  'use strict';", '  const A = {};']
    total = 0
    for name, fn in jobs:
        im, data = fn()
        im.save(os.path.join(OUT, name + '.png'))
        total += len(data)
        lines.append("  A.%s = { w: %d, h: %d, src: 'data:image/png;base64,%s' };" % (name, im.width, im.height, base64.b64encode(data).decode()))
        print('%-11s %4dx%-4d %6d bytes' % (name, im.width, im.height, len(data)))
    lines += ['  root.AW_ASSETS = A;', "})(typeof globalThis !== 'undefined' ? globalThis : this);", '']
    with open(os.path.join(ROOT, 'js', 'assets.js'), 'w') as f:
        f.write('\n'.join(lines))
    print('total', total, 'bytes')


if __name__ == '__main__':
    main()
