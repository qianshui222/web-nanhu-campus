"""Build editable Nanhu models and independent Three.js-ready GLBs.

Run with Blender 4.5 LTS in background mode. World transforms come from
scene.json. Geometry here uses Three.js X/elevation/Z before conversion to
Blender X/-Z/elevation. glTF's Y-up export reverses that conversion.
"""
from argparse import ArgumentParser
from collections import defaultdict
import hashlib
import json
from math import atan2, cos, hypot, pi, sin
from pathlib import Path
import sys

import bpy
import bmesh


ROOT = Path(__file__).resolve().parents[1]
SCENE_PATH = ROOT / 'backend/src/main/resources/scene.json'
WEB_ROOT = ROOT / 'frontend/public'
SOURCE_ROOT = ROOT / 'modeling/source'
PALETTE = json.loads((Path(__file__).with_name('palette.json')).read_text(encoding='utf-8'))
SIDES = {'south': (0, 1), 'north': (0, -1), 'east': (1, 0), 'west': (-1, 0)}


def srgb(value):
    rgb = [int(value[index:index+2], 16) / 255 for index in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb) + (1,)


def materials():
    for kind, values in PALETTE['surface'].items():
        material = bpy.data.materials.new('nanhu_' + kind)
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value = values['roughness']
        shader.inputs['Metallic'].default_value = values['metallic']
        attribute = material.node_tree.nodes.new('ShaderNodeVertexColor')
        attribute.layer_name = 'Finish'
        material.node_tree.links.new(attribute.outputs['Color'], shader.inputs['Base Color'])
        yield kind, material


class Building:
    def __init__(self, place, entrance):
        self.place = place
        self.w, self.d, self.h, self.floors = (place[key] for key in ('w', 'd', 'h', 'floors'))
        self.shell = place['color']
        self.parts = defaultdict(list)
        angle = place['angle'] * pi / 180
        dx, dz = entrance['x']-place['x'], entrance['z']-place['z']
        lx, lz = cos(angle)*dx-sin(angle)*dz, sin(angle)*dx+cos(angle)*dz
        inferred = ('east' if lx>0 else 'west') if abs(lx)/self.w > abs(lz)/self.d else ('south' if lz>0 else 'north')
        self.front = place['asset'].get('facade') or inferred
        sx, sz = SIDES[self.front]
        self.offset = place['asset'].get('doorOffset')
        if self.offset is None:
            span = self.w if sz else self.d
            self.offset = max(-span*.36, min(span*.36, lx*sz-lz*sx))

    def prism(self, hull, lo, hi, color, part='form'):
        n = len(hull)
        points = [(x, -z, y) for y in (lo, hi) for x, z in hull]
        faces = [tuple(reversed(range(n))), tuple(range(n, n*2))]
        faces.extend((i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n))
        self.parts[part].append((points, faces, PALETTE['color'].get(color, color)))

    def box(self, w, h, d, x, y, z, color, part='form', angle=0, bevel=0):
        hw, hd = w/2, d/2
        b = min(bevel, hw*.3, hd*.3)
        hull = [(-hw,-hd), (hw,-hd), (hw,hd), (-hw,hd)]
        if b:
            hull = [(-hw+b,-hd), (hw-b,-hd), (hw,-hd+b), (hw,hd-b),
                    (hw-b,hd), (-hw+b,hd), (-hw,hd-b), (-hw,-hd+b)]
        self.prism([(x+cos(angle)*u+sin(angle)*v,z-sin(angle)*u+cos(angle)*v)
                    for u,v in hull],y,y+h,color,part)

    def facade(self, side, horizontal, y, outward, span, height, depth, color, part='relief'):
        nx,nz = SIDES[side]
        wall = (self.w if nx else self.d)/2
        self.box(span,height,depth, nz*horizontal+nx*(wall+outward), y,
                 -nx*horizontal+nz*(wall+outward), color,part,atan2(nx,nz))

    def windows(self, side, number, vertical_band=(.14,.88), width=.64, phase=0, continuous=False):
        span = self.w if side in ('north','south') else self.d
        step = span*.91 / number
        lo, hi = vertical_band
        rise = (hi-lo)*self.h/self.floors
        for level in range(self.floors):
            for col in range(number):
                mid = (col+.5-number/2)*step
                y = lo*self.h + rise*(level+.12)
                height = rise*(.74 if continuous else .65)
                face = 'glowing' if (5*col+3*level+phase)%9==0 else 'glaze'
                self.facade(side,mid,y-.06,.035,step*width+.14,height+.12,.12,'frame')
                self.facade(side,mid,y,.102,step*width,height,.048,'window',face)
                if continuous:
                    self.facade(side,mid,y,.143,.075,height,.035,'frame')

    def entry(self, opening, canopy, sign=False):
        k, u = self.front, self.offset
        h = min(self.h*.38, 3.3)
        self.facade(k,u,0,.085,opening,h,.16,'vestibule','glaze')
        self.facade(k,u,0,.18,.15,h,.18,'frame')
        for edge in (-1,1):
            self.facade(k,u+edge*opening*.51,0,.26,.27,h,.48,'stone')
        if canopy:
            self.facade(k,u,h,.65,opening+.85,.24,1.43,'stone','form')
            self.facade(k,u,h-.055,.75,opening+.36,.045,1.32,'roof','relief')
        for i, high in enumerate((.40,.27,.14)):
            self.facade(k,u,0,.24+i*.26,opening+.96,high,.48,'paving','form')
        if sign:
            self.facade(k,u,h+.215,1.37,opening*.92,.53,.12,'brick','form')
            # Editable vector lettering is separate geometry in the saved Blender scene.
            self.label('NANHU CANTEEN',u,h+.34,1.44,opening*.80)

    def label(self,text,offset,height,depth,target_width):
        curve = bpy.data.curves.new(text, 'FONT')
        curve.body = text
        curve.align_x = 'CENTER'
        curve.resolution_u = 3
        object_ = bpy.data.objects.new(text,curve)
        bpy.context.collection.objects.link(object_)
        nx,nz = SIDES[self.front]
        wall = (self.w if nx else self.d)/2
        x = nz*offset + nx*(wall+depth)
        z = -nx*offset + nz*(wall+depth)
        object_.location = (x,-z,height)
        object_.rotation_euler = (pi/2,0,atan2(nx,nz))
        curve.size = .42
        bpy.context.view_layer.update()
        factor = min(1,target_width/max(object_.dimensions.x,object_.dimensions.y,.01))
        curve.size *= factor
        return object_

    def base(self, depth=None):
        self.box(self.w,.40,self.d if depth is None else depth,0,0,0,'plinth',bevel=.18)

    def complex(self):
        w,d,h = self.w,self.d,self.h
        self.base()
        self.box(w,h*.22,d,0,.40,0,'concrete',bevel=.35)
        self.box(w,h*.76,d*.91,0,h*.22,-d*.032,'shell-light',bevel=.30)
        self.box(w,h*.032,d*.92,0,h*.976,-d*.033,'parapet',bevel=.18)
        # Broad diagonal clad piers and narrow blue reveals seen on the north photo.
        for side in ('north','south'):
            face = -.99 if side=='north' else -1.02
            self.facade(side,0,h*.24,face,w*.94,h*.69,.36,'vestibule','form')
            for bay in range(42):
                x = (bay-20.5) * w*.92/42
                for row in range(8):
                    y = h*(.254+row*.082)
                    role = 'glowing' if (bay*11+row)%13==0 else 'glaze'
                    self.facade(side,x,y,face+.205,w*.016,h*.057,.10,'blue-glass' if bay%4==0 else 'window',role)
                self.facade(side,x-w*.007,h*.23,face+.29,.14,h*.71,.15,'frame')
            for center, sign in [(-.34,1),(-.08,-1),(.28,-1)]:
                u = w*center
                z = (self.d/2+face+.38)*SIDES[side][1]
                drift = w*.066*sign*SIDES[side][1]
                shape = [(u-drift-.86,h*.23),(u-drift+.86,h*.23),(u+.86,h*.963),(u-.86,h*.963)]
                verts = [(x,-(z+dz),y) for dz in (-.27,.27) for x,y in shape]
                faces = [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
                self.parts['form'].append((verts,faces,PALETTE['color']['concrete']))
                rib = [(x+1.2,y) for x,y in shape]
                verts = [(x,-(z+dz),y) for dz in (-.08,.08) for x,y in rib]
                self.parts['relief'].append((verts,faces,PALETTE['color']['blue-glass']))
        for i in (-1,0,1):
            x = i*w*.267
            self.box(w*.192,.22,d*.43,x,h+.11,0,'roof')
            for z in (-d*.22,d*.22):
                self.box(w*.204,.72,.35,x,h+.11,z,'concrete')
            for dx in (-w*.104,w*.104):
                self.box(.35,.72,d*.44,x+dx,h+.11,0,'concrete')
        self.entry(6.2,True)

    def annex(self):
        w,d,h = self.w,self.d,self.h
        self.base()
        self.box(w,h*.72,d,0,.3,0,'shell-light',bevel=.16)
        self.box(w*.68,h*.26,d*.71,0,h*.73,-d*.073,'brick',bevel=.12)
        self.box(w*.71,.37,d*.74,0,h-.28,-d*.073,'roof',bevel=.18)
        for sign in (-1,1):
            self.box(w*.126,.16,d*.72,w*.414*sign,h*.74,-d*.015,'green-roof')
            self.box(.28,.46,d*.78,w*.48*sign,h*.75,-d*.02,'concrete')
        for side in SIDES:
            self.windows(side,5 if side in ('east','west') else 3,(.10,.66),.73)
        self.entry(w*.36,True)

    def canteen(self):
        w,d,h = self.w,self.d,self.h
        self.base()
        self.box(w,h-.55,d,0,.4,0,'brick',bevel=.18)
        self.box(w,.45,d,0,h-.15,0,'parapet',bevel=.15)
        self.box(w*.92,.13,d*.89,0,h+.28,0,'roof')
        for side in SIDES:
            cols = 8 if side in ('north','south') else 5
            self.windows(side,cols,(.09,.91),.7,phase=2,continuous=True)
            if side not in (self.front,'east'):
                continue
            span = w if side in ('north','south') else d
            for col in range(cols+1):
                u = span*.92*(col/cols-.5)
                base = min(h*.38,3.3) if side==self.front and abs(u-self.offset)<3.45 else .18
                self.facade(side,u,base,.084,.43,h*.985-base,.23,'brick-accent','form')
            for level in range(1,3):
                self.facade(side,0,h*level/3,.15,span*.98,.23,.34,'brick-accent')
        for x,z,a,b in [(-w*.22,-d*.17,.26,.25),(w*.22,d*.08,.19,.30)]:
            self.box(w*a,.52,d*b,x,h+.4,z,'roof',bevel=.13)
            self.box(w*a*.94,.12,d*b*.91,x,h+.92,z,'stone')
        self.entry(6.9,True,sign=True)

    def hall(self):
        w,d,h = self.w,self.d,self.h
        self.base()
        self.box(w,h*.84,d,0,.35,0,'concrete',bevel=.26)
        self.box(w,h*.12,d,0,h*.83,0,'roof',bevel=.28)
        self.box(w*.80,.54,d*.76,0,h*.948,0,'metal',bevel=.36)
        for i in range(9):
            self.box(.12,.10,d*.76,(i-4)*w*.08,h+.03,0,'parapet','relief')
        for side in SIDES:
            self.windows(side,8 if side in ('north','south') else 4,(.26,.76),.69,2)
        self.entry(min(w,d)*.26,True)

    def dorm(self):
        w,d,h = self.w,self.d,self.h
        style = self.place['asset'].get('variant','concrete')
        self.base()
        self.box(w,h-.60,d,0,.40,0,self.shell,bevel=.16)
        self.box(w,.24,d,0,h-.25,0,'parapet')
        self.box(w*.87,.24,d*.83,0,h,0,'roof')
        for side in SIDES:
            count = max(2, round((w if side in ('south','north') else d)/2.5))
            self.windows(side,count,phase=len(self.place['id']),width=.60)
            if side not in (self.front, 'south'):
                continue
            span = w if side in ('south','north') else d
            if style=='brick':
                for col in range(1,count):
                    self.facade(side,span*(col/count-.5),.4,.075,.28,h-.54,.3,'brick-accent','form')
            elif style=='banded':
                self.facade(side,span*.32,.55,.145,span*.13,h-.6,.22,'stone','form')
                for floor in range(1,self.floors):
                    self.facade(side,0,h*floor/self.floors,.13,span*.97,.13,.29,'stone')
            else:
                for sign in (-1,1):
                    self.facade(side,span*.23*sign,.52,.115,.28,h-.68,.26,'parapet','form')
        self.box(w*.16,.57,d*.28,w*.23,h+.14,-d*.16,'roof',bevel=.10)
        self.entry(min(w,d)*.25,self.front in ('south','east'))

    def service(self):
        w,d,h = self.w,self.d,self.h
        self.base()
        self.box(w,h-.53,d,0,.4,0,self.shell,bevel=.17)
        self.box(w,.22,d,0,h-.23,0,'parapet',bevel=.16)
        self.box(w*.64,.27,d*.72,-w*.12,h,0,'roof',bevel=.12)
        for side in SIDES:
            self.windows(side,max(2,round((d if side in ('east','west') else w)/3)),phase=4)
        self.entry(min(w,d)*.33,True)


def build_mesh(name, pieces, material):
    vertices, faces, colors = [], [], []
    for points, shell, color in pieces:
        faces.extend(tuple(len(vertices)+i for i in face) for face in shell)
        vertices.extend(points)
        colors.extend(srgb(color) for _ in shell)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    attr = mesh.color_attributes.new(name='Finish', type='BYTE_COLOR', domain='CORNER')
    for polygon,color in zip(mesh.polygons,colors):
        for index in polygon.loop_indices:
            attr.data[index].color = color
    mesh.color_attributes.active_color = attr
    # Recalculate each solid's outward normals without smoothing hard edges.
    tmp = bmesh.new()
    tmp.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(tmp,faces=list(tmp.faces))
    tmp.to_mesh(mesh)
    tmp.free()
    mesh.materials.append(material)
    mesh.calc_loop_triangles()
    object_ = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(object_)
    return object_


def save_building(place, entrance, source_dir, building_type=Building):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'NONE'
    by_role = dict(materials())
    shape = building_type(place, entrance)
    builder = {'complex':shape.complex,'annex':shape.annex,'canteen':shape.canteen,
               'hall':shape.hall,'dorm':shape.dorm}.get(place['style'],shape.service)
    builder()
    root = bpy.data.objects.new(place['id'], None)
    bpy.context.collection.objects.link(root)
    root['buildingId'] = place['id']
    root['front'] = shape.front
    root['dimensions'] = [shape.w, shape.h, shape.d]
    root['frame'] = 'x-right y-up z-south; center at grade'
    root['status'] = place['asset']['status']
    for role, pieces in shape.parts.items():
        mesh = build_mesh(role, pieces, by_role[role])
        mesh.parent = root
        mesh['surface'] = role
    for obj in [obj for obj in bpy.context.collection.objects if obj.type=='FONT']:
        obj.parent = root
        sign = by_role['form'].copy()
        sign.name = 'nanhu_lettering'
        node = sign.node_tree.nodes.get('Principled BSDF')
        for link in list(node.inputs['Base Color'].links):
            sign.node_tree.links.remove(link)
        node.inputs['Base Color'].default_value = srgb(PALETTE['color']['parapet'])
        obj.data.materials.append(sign)
        obj['surface'] = 'relief'
    path = WEB_ROOT / place['asset']['model'].lstrip('/')
    path.parent.mkdir(parents=True, exist_ok=True)
    source = source_dir / (place['id']+'.blend')
    source_dir.mkdir(parents=True,exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
    status = bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,
         export_extras=True,export_materials='EXPORT',export_attributes=True,
         export_vertex_color='ACTIVE',export_animations=False,
         export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=5,
         export_draco_position_quantization=15,export_draco_normal_quantization=10)
    if 'FINISHED' not in status or not path.is_file() or path.stat().st_size<1000:
        raise RuntimeError(f"{place['id']}: GLB export failed")
    return {'buildingId':place['id'],'name':place['name'],'model':place['asset']['model'],
            'source':source.relative_to(ROOT).as_posix(),'template':place['style'],
            'facade':shape.front,'doorOffset':round(shape.offset,3),
            'dimensions':[shape.w,shape.h,shape.d],'verification':place['asset']['status'],
            'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    cli = ArgumentParser()
    cli.add_argument('--only')
    args = cli.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    data = json.loads(SCENE_PATH.read_text(encoding='utf-8-sig'))
    nodes = {item['id']:item for item in data['nodes']}
    places = [item for item in data['places'] if item['h']>0]
    if args.only:
        places = [item for item in places if item['id']==args.only]
    if not places:
        raise ValueError('No matching physical buildings')
    manifest = [save_building(item,nodes[item['entry']],SOURCE_ROOT) for item in places]
    if not args.only:
        manifest_path = ROOT/'modeling/manifest.json'
        manifest_path.write_text(json.dumps({'blender':bpy.app.version_string,'assets':manifest},
                                          ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Completed {len(manifest)} verified Blender exports')


if __name__=='__main__':
    main()
