#!/usr/bin/env python3
"""Trace the fourteen actual dogs in dog-mosaic.png into matching SVG masks.

The illustrated dark outlines separate connected color regions. Reviewed region
groups merge each dog's white patches, spots, ears, and paws; four small gray-coat
seed masks preserve black dogs whose fur is as dark as the illustration's ink.
Unassigned ink is divided between its neighboring dogs. No geometric puzzle
grid or independent dog portraits are used.

Run with the bundled Python (Pillow + NumPy):
  python scripts/segment-mosaic.py

The region IDs below belong to this specific illustration. A newly generated
illustration requires reviewing the numbered component diagnostic and updating
GROUPS and GRAY_SEEDS before generating its playable masks.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict, deque
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
GRID = 627
WORLD = 600
NAMES = ['金毛', '边牧', '柴犬', '巴吉度', '横卧腊肠犬', '哈士奇', '萨摩耶',
         '比格', '贵宾', '巴哥', '斑点犬', '黑棕腊肠犬', '柯基', '长毛红犬']
# Region numbers are printed in work/mosaic-diagnostics/components.png.
# The long orange-brown curled tail (61, 71, 76, 77) belongs to dog 5.
GROUPS = [
    [12, 35, 43], [2, 6, 9, 20, 27, 36, 39, 40, 41, 44, 47], [3, 5, 34],
    [38, 51], [49, 61, 71, 76, 77], [55, 58, 73, 92], [53], [81, 86],
    [62], [88, 106, 114, 122, 128], [89, 98, 155, 157, 163],
    [118, 127, 144, 148, 154, 158, 160, 161, 167], [121], [165, 172, 175, 178],
]
GRAY_SEEDS = {
    2: [(197, 64), (221, 49), (285, 39), (326, 44), (351, 39), (357, 62),
        (352, 98), (367, 138), (352, 151), (336, 141), (300, 113), (274, 125),
        (243, 145), (217, 149), (202, 131), (218, 108), (216, 76)],
    8: [(354, 228), (372, 225), (389, 238), (419, 249), (420, 260), (385, 256),
        (361, 273), (348, 297), (332, 295), (344, 268)],
    11: [(278, 326), (308, 323), (337, 319), (369, 321), (394, 338), (398, 371),
         (417, 445), (402, 469), (346, 484), (317, 452), (319, 400), (307, 372), (295, 347)],
    12: [(399, 340), (433, 341), (450, 341), (468, 360), (480, 380), (505, 391), (532, 412),
         (527, 449), (511, 483), (504, 497), (484, 481), (458, 470), (425, 464),
         (420, 438), (414, 412), (399, 392), (391, 371)],
}
STEPS = ((0, 1), (0, -1), (1, 0), (-1, 0))


def components(mask: np.ndarray) -> tuple[np.ndarray, list[np.ndarray]]:
    height, width = mask.shape
    labels = np.zeros(mask.shape, dtype=np.int32)
    groups = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or labels[y, x]:
                continue
            number = len(groups) + 1
            points = []
            queue = deque([(y, x)])
            labels[y, x] = number
            while queue:
                yy, xx = queue.popleft()
                points.append((yy, xx))
                for dy, dx in STEPS:
                    ny, nx = yy + dy, xx + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = number
                        queue.append((ny, nx))
            groups.append(np.asarray(points))
    return labels, groups


def background_mask(rgb: np.ndarray) -> np.ndarray:
    candidate = rgb.min(axis=2) > 235
    labels, regions = components(candidate)
    # White regions inside dogs remain foreground; only paper touching a corner
    # is removed. The image has a continuous white margin around the silhouette.
    paper = int(labels[0, 0])
    return labels == paper


def segment(rgb: np.ndarray, output_dir: Path) -> np.ndarray:
    red, green, blue = [rgb[:, :, i].astype(int) for i in range(3)]
    ink = (green < 65) & (blue < 54) & (red < 110)
    ink = np.asarray(Image.fromarray(ink.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0
    raw, regions = components(~ink & ~(rgb.min(axis=2) > 238))
    diagnostic = np.full_like(rgb, 255)
    colors = np.random.default_rng(7).integers(30, 230, (len(regions), 3))
    largest = sorted(range(len(regions)), key=lambda i: len(regions[i]), reverse=True)[:80]
    for i in largest:
        if len(regions[i]) >= 15:
            points = regions[i]
            diagnostic[points[:, 0], points[:, 1]] = colors[i]
    picture = Image.fromarray(diagnostic)
    draw = ImageDraw.Draw(picture)
    for i in largest:
        if len(regions[i]) >= 15:
            y, x = regions[i].mean(axis=0)
            draw.text((x, y), str(i + 1), fill='black', stroke_width=1, stroke_fill='white', anchor='mm')
    picture.resize((1254, 1254)).save(output_dir / 'components.png')

    labels = np.zeros(raw.shape, dtype=np.int32)
    for index, numbers in enumerate(GROUPS, 1):
        labels[np.isin(raw, numbers)] = index
    gray = (red - green < 20) & (green - blue < 18) & (red < 130) & (green > 20) & (blue > 19)
    for index, vertices in GRAY_SEEDS.items():
        seed = Image.new('1', (GRID, GRID))
        ImageDraw.Draw(seed).polygon(vertices, fill=1)
        labels[np.asarray(seed) & gray] = index

    foreground = ~background_mask(rgb)
    labels[~foreground] = 0
    queue = deque(map(tuple, np.argwhere(labels > 0)))
    while queue:
        y, x = queue.popleft()
        owner = labels[y, x]
        for dy, dx in STEPS:
            yy, xx = y + dy, x + dx
            if 0 <= yy < GRID and 0 <= xx < GRID and foreground[yy, xx] and not labels[yy, xx]:
                labels[yy, xx] = owner
                queue.append((yy, xx))

    # A short break in the painted line joins the beagle's white back patch to
    # the dachshund's orange tail. This reviewed boundary follows that real ink
    # line and keeps the complete tail with dog 5 and white back with dog 8.
    below_tail = Image.new('1', (GRID, GRID))
    boundary = [(348, 243), (349, 239), (351, 236), (354, 233), (358, 230),
                (362, 227), (367, 226), (372, 226), (377, 227), (381, 228),
                (386, 230), (392, 233), (397, 236), (403, 240), (408, 244),
                (413, 248), (419, 251), (425, 253), (432, 254), (438, 254),
                (444, 253), (450, 251), (455, 248), (455, 265), (340, 265), (340, 243)]
    ImageDraw.Draw(below_tail).polygon(boundary, fill=1)
    labels[np.asarray(below_tail) & np.isin(labels, [5, 8])] = 8
    return labels


def trace(mask: np.ndarray) -> str:
    """Follow exact raster cell edges, removing only collinear vertices.

    Unlike independently simplifying each dog with a tolerance, this keeps both
    copies of every shared cut identical and guarantees no overlap or gaps.
    """
    padded = np.pad(mask, 1)
    borders = [mask & ~padded[:-2, 1:-1], mask & ~padded[1:-1, 2:],
               mask & ~padded[2:, 1:-1], mask & ~padded[1:-1, :-2]]
    edges = defaultdict(list)
    for side, border in enumerate(borders):
        for y, x in np.argwhere(border):
            y, x = int(y), int(x)
            a, b = [((x, y), (x + 1, y)), ((x + 1, y), (x + 1, y + 1)),
                    ((x + 1, y + 1), (x, y + 1)), ((x, y + 1), (x, y))][side]
            edges[a].append(b)
    loops = []
    while edges:
        start = next(iter(edges))
        current = start
        previous = (start[0] - 1, start[1])
        loop = []
        while True:
            loop.append(current)
            choices = edges[current]
            if len(choices) > 1:
                dx, dy = current[0] - previous[0], current[1] - previous[1]
                # At a diagonal contact, stay on the same pixel boundary.
                def turn(p):
                    nx, ny = p[0] - current[0], p[1] - current[1]
                    return {(1, 0): 0, (0, 1): 1, (-1, 0): 2, (0, -1): 3}.get((dx * ny - dy * nx, dx * nx + dy * ny), 4)
                following = min(choices, key=turn)
                choices.remove(following)
            else:
                following = choices.pop()
            if not choices:
                del edges[current]
            previous, current = current, following
            if current == start:
                break
        reduced = []
        for i, p in enumerate(loop):
            a, b = loop[i - 1], loop[(i + 1) % len(loop)]
            if (p[0] - a[0]) * (b[1] - p[1]) != (p[1] - a[1]) * (b[0] - p[0]):
                reduced.append(p)
        if len(reduced) >= 3:
            loops.append(reduced)
    scale = WORLD / GRID
    def coordinate(p):
        return f'{p[0] * scale:.3f},{p[1] * scale:.3f}'
    return ' '.join('M' + ' L'.join(map(coordinate, loop)) + ' Z' for loop in loops)


def level_data(labels: np.ndarray, original_size: tuple[int, int]) -> dict:
    shared = Counter()
    for a, b in [(labels[:, :-1], labels[:, 1:]), (labels[:-1], labels[1:])]:
        different = (a != b) & (a > 0) & (b > 0)
        for left, right in zip(a[different], b[different]):
            shared[tuple(sorted((int(left), int(right))))] += 1
    scale = WORLD / GRID
    pieces = []
    for number, name in enumerate(NAMES, 1):
        mask = labels == number
        ys, xs = np.where(mask)
        if not len(xs):
            raise ValueError(f'Missing dog {number}: {name}')
        cx, cy = xs.mean(), ys.mean()
        nearest = np.argmin((xs - cx) ** 2 + (ys - cy) ** 2)
        x, y = xs.min() * scale, ys.min() * scale
        right, bottom = (xs.max() + 1) * scale, (ys.max() + 1) * scale
        pieces.append({
            'id': f'p{number:02d}', 'name': name, 'path': trace(mask),
            'image': f'/assets/pieces/p{number:02d}.png',
            'neighbors': [f'p{(b if a == number else a):02d}' for (a, b), length in shared.items()
                          if number in (a, b) and length >= 2],
            'center': {'x': round((xs[nearest] + .5) * scale, 3), 'y': round((ys[nearest] + .5) * scale, 3)},
            'bounds': {'x': round(x, 3), 'y': round(y, 3), 'width': round(right, 3) - round(x, 3),
                       'height': round(bottom, 3) - round(y, 3)},
        })
    return {'id': 'puppy-mosaic', 'title': '汪汪全家福', 'subtitle': '14 只小狗，拼成一份快乐',
            'viewBox': '0 0 600 600', 'width': WORLD, 'height': WORLD,
            'image': '/assets/dog-mosaic.png', 'sourceWidth': original_size[0], 'sourceHeight': original_size[1],
            'outline': trace(labels > 0), 'pieces': pieces}


def diagnostics(rgb: np.ndarray, labels: np.ndarray, output_dir: Path) -> None:
    palette = np.random.default_rng(4).integers(50, 220, (15, 3))
    overlay = rgb.copy()
    active = labels > 0
    overlay[active] = (rgb[active] * .25 + palette[labels[active]] * .75).astype(np.uint8)
    picture = Image.fromarray(overlay)
    draw = ImageDraw.Draw(picture)
    for number in range(1, 15):
        ys, xs = np.where(labels == number)
        draw.text((xs.mean(), ys.mean()), str(number), fill='black', stroke_width=1, stroke_fill='white', anchor='mm')
    picture.resize((1254, 1254)).save(output_dir / 'segmentation.png')
    sheet = Image.new('RGB', (1400, 800), '#e8e5dd')
    draw = ImageDraw.Draw(sheet)
    for i in range(14):
        mask = labels == i + 1
        ys, xs = np.where(mask)
        cutout = Image.fromarray(np.dstack((rgb, mask.astype(np.uint8) * 255)))
        cutout = cutout.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        cutout.thumbnail((180, 345), Image.Resampling.LANCZOS)
        x, y = (i % 7) * 200 + (200 - cutout.width) // 2, (i // 7) * 400 + 25
        sheet.paste(cutout, (x, y), cutout)
        draw.text(((i % 7) * 200 + 100, (i // 7) * 400 + 380), f'{i + 1:02d}', fill='#413a30', anchor='mm')
    sheet.save(output_dir / 'cutouts.png')


def export_piece_images(original: Image.Image, labels: np.ndarray, output_dir: Path) -> None:
    """Crop the original-resolution art to precisely the same bounds as paths.

    The generated source is 1254² and the reviewed label grid is 627², so each
    label cell corresponds to exactly 2 × 2 source pixels. SVG images therefore
    have genuine per-piece bounds, including for accessibility and hit testing.
    """
    if original.size != (GRID * 2, GRID * 2):
        raise ValueError('Reviewed masks require the original 1254 × 1254 illustration')
    output_dir.mkdir(parents=True, exist_ok=True)
    for number in range(1, len(NAMES) + 1):
        mask = labels == number
        ys, xs = np.where(mask)
        alpha = Image.fromarray(mask.astype(np.uint8) * 255).resize(original.size, Image.Resampling.NEAREST)
        rgba = original.convert('RGBA')
        rgba.putalpha(alpha)
        crop = (int(xs.min()) * 2, int(ys.min()) * 2,
                (int(xs.max()) + 1) * 2, (int(ys.max()) + 1) * 2)
        rgba.crop(crop).save(output_dir / f'p{number:02d}.png', optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'public/assets/dog-mosaic.png')
    parser.add_argument('--output', type=Path, default=ROOT / 'src/mosaic-data.js')
    parser.add_argument('--diagnostics', type=Path, default=ROOT / 'work/mosaic-diagnostics')
    parser.add_argument('--pieces', type=Path, default=ROOT / 'public/assets/pieces')
    args = parser.parse_args()
    args.diagnostics.mkdir(parents=True, exist_ok=True)
    original = Image.open(args.source).convert('RGB')
    # The 2:1 analysis grid keeps contour error below half a displayed pixel.
    rgb = np.asarray(original.resize((GRID, GRID)))
    labels = segment(rgb, args.diagnostics)
    diagnostics(rgb, labels, args.diagnostics)
    export_piece_images(original, labels, args.pieces)
    data = level_data(labels, original.size)
    args.output.write_text('// Generated by scripts/segment-mosaic.py from the illustrated dog contours.\n'
                           'export const MOSAIC_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'))
                           + ';\nexport default MOSAIC_DATA;\n', encoding='utf-8')
    print(f'Wrote {len(data["pieces"])} actual dog masks to {args.output}')
    print(f'Diagnostics: {args.diagnostics}')
    print(json.dumps([{'id': p['id'], 'name': p['name'], 'bounds': p['bounds'], 'neighbors': p['neighbors']}
                      for p in data['pieces']], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
