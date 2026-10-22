#!/usr/bin/env python3
"""Maintainer-only right-sized WebP derivatives of approved photos; regular builds use committed assets.

Requires Pillow with WebP support. Optional --bucket-source accepts the approved
original bucket-access frame; otherwise the existing full-size WebP is used.
Existing fallbacks are never replaced. No new crop, retouching or generation.
"""
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path
from PIL import Image,ImageOps
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'assets/versioned'
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bucket-source',type=Path);a=p.parse_args()
 selections=[
  ('tree',ROOT/'assets/AngelChainsawSquooshed_008.jpg',(256,320,480,640,840)),
  ('landscaping',ROOT/'assets/versioned/photo-landscaping-service-840.69397f19e9.webp',(256,320,384)),
  ('bucket',a.bucket_source or ROOT/'assets/versioned/project-bucket-access-1600.1bff50f619.webp',(480,720,840,1280,1600)),
 ]
 result={}
 for key,source,widths in selections:
  digest=hashlib.sha256(source.read_bytes()).hexdigest();entries=[]
  with Image.open(source) as opened:
   image=ImageOps.exif_transpose(opened).convert('RGB')
   for width in widths:
    reuse={320:"/assets/versioned/service-tree-320.20be49f1f8.webp",840:"/assets/versioned/service-tree-840.58f189d9e9.webp"} if key=="tree" else {}
    if width in reuse:
     if digest!="b29f5114d300bc4b54f96674e75467502b01e2060ad4863b0ce44cb381477ab6":raise ValueError("Reviewed tree source changed; update fallback mapping")
     entries.append({"src":reuse[width],"width":width,"height":width});continue
    if width>image.width:raise ValueError('Do not upscale approved source')
    height=round(image.height*width/image.width);resized=image.resize((width,height),Image.Resampling.LANCZOS)
    temporary=OUTPUT/f'.mobile-{key}-{width}.webp';resized.save(temporary,'WEBP',quality=78 if key!='landscaping' else 75,method=6,exif=b'',icc_profile=b'')
    checksum=hashlib.sha256(temporary.read_bytes()).hexdigest()[:10];name=f'mobile-{key}-{width}.{checksum}.webp';temporary.replace(OUTPUT/name)
    (OUTPUT/(name+'.json')).write_text(json.dumps({'prompt':f'Origin: owner-approved Angel Tree Services documentary photo; source SHA-256 {digest}. Same approved frame/crop, resized and WebP-encoded only; no retouching or generative changes. EXIF and location metadata omitted.'},indent=2)+'\n')
    entries.append({'src':'/assets/versioned/'+name,'width':width,'height':height})
  result[key]={'source_sha256':digest,'variants':entries}
  print(key,[(x['width'],(ROOT/x['src'].lstrip('/')).stat().st_size) for x in entries])
 (ROOT/'public-mobile-photo-variants.json').write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
