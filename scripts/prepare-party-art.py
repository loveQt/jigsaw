#!/usr/bin/env python3
"""Cover-crop full-bleed dog photographs/artworks into the fixed puzzle paths.

No image API calls. Every tile uses one independent opaque source. Crop to
cover, then apply the cut mask: no inset, colored backing or sticker placement.
"""
from pathlib import Path
import json
import sys
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SCALE, AA = 3, 4
PARTIAL = '--partial' in sys.argv
geometry = json.loads((ROOT / 'work/party-v2/geometry.json').read_text())
source_root = ROOT / 'public/assets/party-source-v2'
missing = [p['id'] for p in geometry['pieces'] if not (source_root / f"{p['id']}.png").exists()]
if missing and not PARTIAL:
    raise SystemExit('Missing full-bleed sources: ' + ', '.join(missing))
output = ROOT / ('work/party-v2/pieces' if PARTIAL else 'public/assets/party-dogs-v2')
output.mkdir(parents=True, exist_ok=True)
size = geometry['width'] * SCALE
colors = np.zeros((size, size, 3), dtype=np.float32)
coverage = np.zeros((size, size), dtype=np.float32)
contact = Image.new('RGBA', (1800, 1500), '#f7f2e8')
manifest = []

for index, piece in enumerate(geometry['pieces']):
    source_path = source_root / f"{piece['id']}.png"
    if not source_path.exists():
        continue
    raw = Image.open(source_path).convert('RGBA')
    if raw.getchannel('A').getextrema()[0] < 255:
        raise ValueError(f"{piece['id']}: source must be opaque and full bleed, not a cutout")
    b = piece['bounds']
    width, height = b['width'] * SCALE, b['height'] * SCALE
    # Uniform scaling always covers the WHOLE bounding box; no padding.
    factor = max(width / raw.width, height / raw.height)
    crop_width, crop_height = width / factor, height / factor
    anchor = piece.get('cropAnchor', [0.5, 0.5])
    zoom = piece.get('cropZoom', 1)
    if zoom < 1:
        raise ValueError('A cover crop must never shrink into an inset')
    crop_width, crop_height = crop_width / zoom, crop_height / zoom
    left = min(max(0, raw.width * anchor[0] - crop_width / 2), raw.width - crop_width)
    top = min(max(0, raw.height * anchor[1] - crop_height / 2), raw.height - crop_height)
    source_box = (left, top, left + crop_width, top + crop_height)
    tile = raw.transform((width, height), Image.Transform.EXTENT, source_box, Image.Resampling.BICUBIC)
    mask = Image.new('L', (width * AA, height * AA), 0)
    points = [((px - b['x']) * SCALE * AA, (py - b['y']) * SCALE * AA) for px, py in piece['points']]
    ImageDraw.Draw(mask).polygon(points, fill=255)
    tile.putalpha(mask.resize((width, height), Image.Resampling.LANCZOS))
    tile.save(output / f"{piece['id']}.png")
    ox, oy = b['x'] * SCALE, b['y'] * SCALE
    rgba = np.asarray(tile, dtype=np.float32)
    weight = rgba[:, :, 3] / 255
    colors[oy:oy+height, ox:ox+width] += rgba[:, :, :3] * weight[:, :, None]
    coverage[oy:oy+height, ox:ox+width] += weight
    thumb = tile.copy()
    thumb.thumbnail((276, 276), Image.Resampling.LANCZOS)
    col, row = index % 6, index // 6
    contact.alpha_composite(thumb, (col*300+(300-thumb.width)//2, row*300+(300-thumb.height)//2))
    manifest.append({'id': piece['id'], 'name': piece['name'], 'style': piece['style'],
                     'category': piece['category'], 'framing': piece['framing'],
                     'source': f"/assets/party-source-v2/{piece['id']}.png",
                     'sourceSize': list(raw.size), 'sourceCrop': list(source_box),
                     'outputSize': [width, height], 'mode': 'cover-then-contour-mask'})

if PARTIAL:
    contact.convert('RGB').save(ROOT / 'work/party-v2/contact-partial.png')
    print(f"Prepared {len(manifest)}/30 review crops; runtime assets unchanged.")
    sys.exit(0)

# Shared edge coverage is complementary, not a stack of translucent layers.
rgb = np.rint(colors / np.maximum(coverage[:, :, None], 1e-9)).clip(0, 255).astype(np.uint8)
outer = Image.new('L', (size * AA, size * AA), 0)
ImageDraw.Draw(outer).polygon([(x*SCALE*AA, y*SCALE*AA) for x, y in geometry['outlinePoints']], fill=255)
preview = Image.fromarray(rgb).convert('RGBA')
preview.putalpha(outer.resize((size, size), Image.Resampling.LANCZOS))
preview.save(ROOT / 'public/assets/party-dogs-v2.png')
contact.convert('RGB').save(ROOT / 'public/assets/party-contact-v2.png')
(ROOT / 'docs/party-source-manifest-v2.json').write_text(json.dumps({
    'generator': 'built-in image_gen', 'revision': 'full-bleed-v2',
    'pixelScale': SCALE, 'pieces': manifest,
}, ensure_ascii=False, indent=2))
print(f"Assembled {len(manifest)} full-bleed dog pieces and {size} × {size} reference.")
