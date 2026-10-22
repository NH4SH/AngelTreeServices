"""Apply right-sized mobile WebP sources to two approved public pages.

Keep each original img as the fallback and retain all old asset URLs. The picture
wrapper has no layout box; CSS continues to size and crop the existing img.
"""
from __future__ import annotations
import json,re
from html import escape
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TREE_SIZES='(max-width: 384px) calc(78vw - 16px), (max-width: 700px) 284px, (max-width: 760px) calc(100vw - 40px), 42vw'

def optimize_mobile_photos(output: Path) -> None:
 manifest=json.loads((ROOT/'public-mobile-photo-variants.json').read_text())
 cases={
  'index.html':[
   ('assets/versioned/service-tree-512.705dacd21f.webp','tree',None),
   ('assets/versioned/photo-landscaping-service-512.16653c31d4.webp','landscaping',None),
   ('/assets/versioned/project-bucket-access-840.aa86f67e80.webp','bucket',None),
  ],
  'services/tree-removal/index.html':[
   ('/assets/AngelChainsawSquooshed_008.jpg','tree',TREE_SIZES),
   ('/assets/versioned/project-bucket-access-1280.abe084e062.webp','bucket',None),
  ],
 }
 for page,photos in cases.items():
  target=output/page;s=target.read_text()
  for source,key,new_sizes in photos:
   pattern=r'<img\b(?=[^>]*\bsrc="'+re.escape(source)+r'")[^>]*>'
   matches=list(re.finditer(pattern,s))
   if len(matches)!=1:raise RuntimeError(f'Expected one unchanged {key} fallback on {page}')
   old=matches[0].group();image=old
   sizes=re.search(r'\bsizes="([^"]+)"',image)
   if not sizes:raise RuntimeError('Responsive fallback needs an explicit sizes hint')
   hint=new_sizes or sizes[1]
   if new_sizes:image=image.replace(sizes.group(),'sizes="'+escape(hint,quote=True)+'"')
   candidates=', '.join(f"{v['src']} {v['width']}w" for v in manifest[key]['variants'])
   # No desktop source change and no new layout box or image load event handler.
   picture='<picture style="display:contents"><source media="(max-width: 800px)" type="image/webp" srcset="'+escape(candidates,quote=True)+'" sizes="'+escape(hint,quote=True)+'">'+image+'</picture>'
   s=s.replace(old,picture,1)
  target.write_text(s)
