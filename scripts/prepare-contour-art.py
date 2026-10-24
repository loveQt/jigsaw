#!/usr/bin/env python3
"""Prepare fixed contour references, or crop site-generated images to those contours.

No image API calls here. Sources must be generated separately with site-imagegen.
The outline owns all geometry; generated pixels never alter the cutting lines.
"""
from pathlib import Path
import json
import sys
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work/contour-v2'
SOURCES = ROOT / 'public/assets/contour-source-v2'
OUTPUT = ROOT / 'public/assets/contour-dogs-v2'
SCALE = 3
AA = 4
CANVAS = 1024
MARGIN = 100

def placement(piece):
    b = piece['bounds']
    factor = (CANVAS - 2*MARGIN) / max(b['width'], b['height'])
    return factor, (CANVAS - b['width']*factor)/2, (CANVAS - b['height']*factor)/2

def polygon(piece, scale, x=0, y=0):
    b = piece['bounds']
    return [((px-b['x'])*scale+x, (py-b['y'])*scale+y) for px,py in piece['points']]

def prompt(piece):
    return f'''Use case: illustration-story. Asset: one independently generated illustrated wooden-puzzle piece.
Image 1 is the FIXED silhouette/composition reference, not a character style reference. The pale tan region is the exact dog-head cutting silhouette and its light gray outer band is a 14px print bleed. Replace the flat shape with ONE adorable dog head; the whole head fills this silhouette naturally.
Subject: {piece['subject']}
Style: sophisticated hand-painted children's book illustration, warm natural muted fur colors, delicate gouache texture, dimensional but flat-painted shading, expressive small glossy dark eyes, tidy ink details, soft furry edges. Visually beautiful and anatomically plausible. Do not render crude geometric vector clip art.
Composition invariants: preserve the image canvas and the EXACT position, scale and proportions of the supplied silhouette. Upper projections are EARS; the broad middle is the FACE; the lower arc is the CHIN. The outer contour may simplify real anatomy. Keep both eyes, nose and mouth comfortably in the broad interior. Fill every part of the tan region with the dog's fur, cheeks, ears or neck and extend fur color into the thin gray bleed band. It is a close-up head, NOT a small head pasted onto an abstract colored tile. No separate background within the shape. No body, extra legs, extra ears, additional dogs or detached features.
Background outside the template and bleed: plain white. No cast shadow, no floor, no props, no frame, no lettering, no labels, no watermark. No visible template outline, guide marks or grid. Make a polished illustration while keeping the existing cutting template unchanged.
'''

geometry = json.loads((WORK/'geometry.json').read_text())
SOURCES.mkdir(parents=True,exist_ok=True)
if sys.argv[1] == 'prepare':
    (WORK/'guides').mkdir(parents=True,exist_ok=True)
    (WORK/'prompts').mkdir(parents=True,exist_ok=True)
    sheet = Image.new('RGB',(1536,1536),'#f4f0e8')
    for i,piece in enumerate(geometry['pieces']):
        scale,x,y = placement(piece)
        guide = Image.new('RGB',(CANVAS*2,CANVAS*2),'white')
        draw = ImageDraw.Draw(guide)
        points = polygon(piece,scale*2,x*2,y*2)
        draw.polygon(points,fill='#dfc9a6')
        draw.line(points+[points[0]], fill='#e3dfd5', width=56, joint='curve')
        draw.polygon(points,fill='#dfc9a6')
        guide = guide.resize((CANVAS,CANVAS),Image.Resampling.LANCZOS)
        guide.save(WORK/'guides'/f"{piece['id']}.png")
        (WORK/'prompts'/f"{piece['id']}.txt").write_text(prompt(piece))
        tile=guide.resize((480,480),Image.Resampling.LANCZOS)
        sheet.paste(tile,((i%3)*512+16,(i//3)*512+16))
    sheet.save(WORK/'guide-contact-sheet.png')
    print('Prepared nine contour references and individual prompts. No API request made.')
else:
    missing=[p['id'] for p in geometry['pieces'] if not (SOURCES/f"{p['id']}.png").exists()]
    if missing: raise SystemExit('Missing site-generated source images: '+', '.join(missing))
    OUTPUT.mkdir(parents=True,exist_ok=True)
    color_sum=np.zeros((600*SCALE,600*SCALE,3),dtype=np.float32)
    coverage=np.zeros((600*SCALE,600*SCALE),dtype=np.float32)
    contact=Image.new('RGBA',(1536,1536),'#f5f0e6')
    source_info=[]
    for i,piece in enumerate(geometry['pieces']):
        b=piece['bounds']
        w,h=b['width']*SCALE,b['height']*SCALE
        scale,x,y=placement(piece)
        raw=Image.open(SOURCES/f"{piece['id']}.png").convert('RGBA')
        source_info.append({'id':piece['id'],'width':raw.width,'height':raw.height})
        # A request can return a different pixel size. Normalize coordinates by
        # actual dimensions, not by the requested dimensions or visible content.
        sx,sy=raw.width/CANVAS,raw.height/CANVAS
        crop=raw.transform((w,h),Image.Transform.EXTENT,(x*sx,y*sy,(x+b['width']*scale)*sx,(y+b['height']*scale)*sy),Image.Resampling.BICUBIC)
        alpha=Image.new('L',(w*AA,h*AA),0)
        ImageDraw.Draw(alpha).polygon(polygon(piece,SCALE*AA),fill=255)
        alpha=alpha.resize((w,h),Image.Resampling.LANCZOS)
        # Some site outputs have native alpha. Extend only their narrow print
        # bleed before imposing the fixed mask, avoiding transparent-black RGB
        # becoming a black fringe. Never move pixels or reshape facial features.
        rgba=np.array(crop)
        valid=rgba[:,:,3]>=250
        required=np.asarray(alpha)>0
        missing=required & ~valid
        missing_ratio=float(missing.sum()/max(1,required.sum()))
        if missing_ratio>0.02:
            raise ValueError(f"{piece['id']}: source leaves {missing_ratio:.1%} of the template unpainted; regenerate its bleed")
        source_info[-1]['bleedFraction']=round(missing_ratio,6)
        for iteration in range(16):
            if not np.any(required & ~valid): break
            for dy,dx in ((-1,0),(1,0),(0,-1),(0,1)):
                near=np.roll(valid,(dy,dx),(0,1))
                if dy<0: near[-1,:]=False
                if dy>0: near[0,:]=False
                if dx<0: near[:,-1]=False
                if dx>0: near[:,0]=False
                fill=~valid & near
                colors=np.roll(rgba[:,:,:3],(dy,dx),(0,1))
                rgba[:,:,:3][fill]=colors[fill]
                valid[fill]=True
        if np.any(required & ~valid):
            raise ValueError(f"{piece['id']}: artwork needs more than a narrow edge bleed")
        crop=Image.fromarray(rgba)
        crop.putalpha(alpha)
        crop.save(OUTPUT/f"{piece['id']}.png")
        ox,oy=b['x']*SCALE,b['y']*SCALE
        rgba=np.asarray(crop,dtype=np.float32)
        weight=rgba[:,:,3]/255
        color_sum[oy:oy+h,ox:ox+w] += rgba[:,:,:3]*weight[:,:,None]
        coverage[oy:oy+h,ox:ox+w] += weight
        thumb=crop.copy()
        thumb.thumbnail((450,450),Image.Resampling.LANCZOS)
        tx=(i%3)*512+(512-thumb.width)//2
        ty=(i//3)*512+(512-thumb.height)//2
        contact.alpha_composite(thumb,(tx,ty))
    # Shared antialiased edges are complementary coverage, not two layers.
    # Normalize their color weights; use ONE outer mask to avoid translucent seams.
    rgb=np.rint(color_sum/np.maximum(coverage[:,:,None],1e-9)).clip(0,255).astype(np.uint8)
    outer=Image.new('L',(600*SCALE*AA,600*SCALE*AA),0)
    ImageDraw.Draw(outer).polygon([(x*SCALE*AA,y*SCALE*AA) for x,y in geometry['outlinePoints']],fill=255)
    outer=outer.resize((600*SCALE,600*SCALE),Image.Resampling.LANCZOS)
    assembled=Image.fromarray(rgb).convert('RGBA')
    assembled.putalpha(outer)
    assembled.save(ROOT/'public/assets/contour-dogs-v2.png')
    contact.convert('RGB').save(ROOT/'public/assets/contour-contact-v2.png')
    (WORK/'source-dimensions.json').write_text(json.dumps(source_info,indent=2))
    print('Cropped 9 source images with the fixed contours; assembled 1800×1800 preview.')
