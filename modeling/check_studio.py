"""Check authored local bounds using Blender's evaluated geometry."""
import hashlib
import json
from pathlib import Path
from mathutils import Vector
import bpy

root=Path(__file__).resolve().parents[1]
scene=json.loads((root/'backend/src/main/resources/scene.json').read_text(encoding='utf-8-sig'))
manifest=json.loads((root/'modeling/studio-manifest.json').read_text(encoding='utf-8-sig'))
places={p['id']:p for p in scene['places'] if p['h']>0}
assert set(places)=={item['buildingId'] for item in manifest['assets']}
results=[]
for item in manifest['assets']:
    p=places[item['buildingId']]
    assert p['asset']['model']==item['standard']
    web_file=root/'frontend/public'/item['model'].lstrip('/')
    assert hashlib.sha256(web_file.read_bytes()).hexdigest()==item['sha256']
    bpy.ops.wm.open_mainfile(filepath=str(root/item['source']))
    root_object=bpy.data.objects[p['id']]
    assert root_object['buildingId']==p['id']
    assert root_object.location.length<1e-6
    assert all(abs(axis-1)<1e-6 for axis in root_object.scale)
    assert all(abs(angle)<1e-6 for angle in root_object.rotation_euler)
    coords=[]
    for child in root_object.children:
        if child.type not in ('MESH','FONT'):
            continue
        evaluated=child.evaluated_get(bpy.context.evaluated_depsgraph_get())
        for corner in evaluated.bound_box:
            x,north,height=evaluated.matrix_world @ Vector(corner)
            coords.append((x,height,-north))
    lo=[min(v[i] for v in coords) for i in range(3)]
    hi=[max(v[i] for v in coords) for i in range(3)]
    expected_lo=[-p['w']/2,0,-p['d']/2]
    expected_hi=[p['w']/2,p['h'],p['d']/2]
    assert all(abs(a-b)<.007 for a,b in zip(lo,expected_lo)), (p['id'],lo,expected_lo)
    assert all(abs(a-b)<.007 for a,b in zip(hi,expected_hi)), (p['id'],hi,expected_hi)
    results.append({'id':p['id'],'minimum':[round(a,4) for a in lo],'maximum':[round(a,4) for a in hi],
                    'glbBytes':web_file.stat().st_size,'sourceBytes':(root/item['source']).stat().st_size})
out=root/'docs/bruno/local-bounds.json'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'PASS {len(results)} local building envelopes')
