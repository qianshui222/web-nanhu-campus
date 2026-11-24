import * as T from 'three'
import { createCampusMaterial, semanticColor } from './campusMaterials.js'

const colors = {
  cream: '#d5d3c1', pale: '#ebe9df', glass: '#527578', dark: '#364d4a',
  concrete: '#b8b6a4', metal: '#667c76', roof: '#746a61', trim: '#c29469'
}

export function makeModels(world) {
  const materials = new Map()
  const boxGeo = new T.BoxGeometry(1, 1, 1)
  const placeholder = new T.Object3D()
  const material = color => {
    if (!materials.has(color)) {
      materials.set(color, createCampusMaterial(color))
    }
    return materials.get(color)
  }
  function box(parent, w, h, d, x, y, z, color, shadow = true) {
    const mesh = new T.Mesh(boxGeo, material(color))
    mesh.scale.set(w,h,d)
    mesh.position.set(x,y,z)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  function instances(parent, transforms, color, cast = false) {
    if (!transforms.length) return
    const batch = new T.InstancedMesh(boxGeo, material(color), transforms.length)
    transforms.forEach(([x,y,z,w,h,d,a = 0], i) => {
      placeholder.position.set(x,y,z)
      placeholder.scale.set(w,h,d)
      placeholder.rotation.set(0,a,0)
      placeholder.updateMatrix()
      batch.setMatrixAt(i, placeholder.matrix)
    })
    batch.castShadow = cast
    batch.receiveShadow = true
    parent.add(batch)
    return batch
  }
  function windows(group, { w,d,h,x = 0,z = 0,y = 0,floors, spacing = 5 }) {
    const rows = [], warmPanes=[], frames=[]
    const faces = [[w,d,0],[w,d,Math.PI],[d,w,Math.PI/2],[d,w,-Math.PI/2]]
    for (const [width, depth, a] of faces) {
      const count = Math.max(1, Math.floor(width/spacing))
      for (let i=0; i<count; i++) {
        const offset = width*(i+0.5)/count - width/2
        for (let level=0; level<floors; level++) {
          const pane=[x + Math.cos(a)*offset + Math.sin(a)*(depth/2+0.075), y + h*(level+0.52)/floors,
            z - Math.sin(a)*offset + Math.cos(a)*(depth/2+0.075), width/count*.65, h/floors*.52, .10, a]
          ;((i*7+level*3+Math.floor(a*10))%9===0 ? warmPanes : rows).push(pane)
          frames.push([pane[0]-Math.sin(a)*.053,pane[1],pane[2]-Math.cos(a)*.053,pane[3]+.19,pane[4]+.16,.12,a])
        }
      }
    }
    instances(group,frames,'#bfc4b9')
    instances(group,rows,colors.glass)
    instances(group,warmPanes,'#84a1a0')
  }
  function block(group, w,h,d,x,y,z,color,floors,spacing) {
    box(group,w,h,d,x,y+h/2,z,color)
    windows(group,{w,h,d,x,y,z,floors,spacing})
  }
  function complex(group, p) {
    const { w,d,h } = p
    block(group,w,h*.23,d,0,0,0,p.color,2,4.6)
    box(group,w+.4,.55,d+.4,0,h*.23,0,colors.cream)
    block(group,w*.83,h*.77,d*.72,-w*.065,h*.23,-d*.065,p.color,Math.max(1,p.floors-2),3.9)
    block(group,w*.105,h*.37,d*.60,w*.40,h*.23,-d*.03,colors.pale,4,4.5)
    box(group,w*.85,.5,d*.73,-w*.065,h,-d*.065,colors.pale)
    const clerestories=[], roofFrames=[]
    for (let i=0;i<3;i++) {
      const at=w*(-.34+i*.265)
      clerestories.push([at,h+.46,-d*.08,w*.185,.34,d*.37])
      for(const sign of [-1,1]) roofFrames.push([at,h+.82,-d*.08+sign*d*.205,w*.218,1.1,.55],
        [at+sign*w*.108,h+.82,-d*.08,.55,1.1,d*.43])
    }
    instances(group,clerestories,'#72847b')
    instances(group,roofFrames,colors.cream,true)
    const capEdges=[], louvers=[]
    for(let i=0;i<25;i++){
      const x=w*(i/25*.7-.40)
      capEdges.push([x,h+.45,d*.303,.19,.48,1.05])
      if(i%3===0)louvers.push([x,h*.70,d*.30,.15,h*.53,.8])
    }
    instances(group,capEdges,'#a2a99e')
    instances(group,louvers,'#cfd3c8')
    // Broad diagonal framing follows the pattern visible in the university's exterior photograph.
    const facade = d*.298 + .17
    const brace = (x1,y1,x2,y2,width,color,z=facade) => {
      const mesh = box(group,width,Math.hypot(x2-x1,y2-y1),.45,(x1+x2)/2,(y1+y2)/2,z,color)
      mesh.rotation.z = Math.atan2(x1-x2,y2-y1)
    }
    const base = h*.25, top = h*.98
    for (const [at, lean] of [[-.39,.11],[-.15,-.11],[.28,-.095]]) {
      brace(w*(at+lean),base,w*at,top,w*.083,colors.pale)
      brace(w*(at+lean)+w*.044,base,w*at+w*.044,top,w*.016,'#508791',facade+.16)
    }
    brace(-w*.202,h*.54,w*.08,h*.54,w*.071,colors.pale)
    brace(w*.13,base,w*.08,h*.54,w*.066,colors.pale)
    box(group,w*.24,3.3,.22,0,1.66,d/2+.13,colors.dark)
    box(group,w*.25,.45,2.2,0,3.7,d/2+.4,colors.cream)
    box(group,5.6,3.4,.22,w/2+.13,1.72,-d*.39,colors.dark).rotation.y = Math.PI/2
    for (let i=0;i<3;i++) box(group,w*.26,.13*(3-i),.39,0,.065*(3-i),d/2+.2+i*.39,colors.concrete)
    for (let i=0;i<2;i++) box(group,.4,.12*(2-i),5.6,w/2+.23+i*.4,.06*(2-i),-d*.39,colors.concrete)
  }
  function annex(group,p) {
    const {w,d,h}=p
    block(group,w,h*.79,d,0,0,0,'#c3cab8',2,4.25)
    box(group,w*.75,h*.21,d*.77,0,h*.895,-d*.06,'#8d7265')
    box(group,w*.83,.20,d*.77,0,h,-d*.06,'#71675c')
    box(group,w*.20,.24,d*.78,-w*.38,h*.82,-d*.025,'#728b68')
    box(group,w*.19,.24,d*.71,w*.39,h*.82,-d*.06,'#78906b')
    box(group,w*.58,.27,4.1,0,3.0,d/2+1.05,colors.pale)
    box(group,w*.44,2.65,.20,0,1.35,d/2+.14,colors.dark)
    box(group,w*.47,2.7,4.7,0,1.35,-d/2-1.8,colors.glass)
    for(let i=0;i<4;i++) box(group,w*.62,.12*(4-i),.49,0,.06*(4-i),d/2+.25+i*.48,colors.concrete)
  }
  function canteen(group,p) {
    const {w,d,h}=p
    box(group,w+.65,.50,d+.65,0,.24,0,colors.concrete)
    block(group,w,h,d,0,.40,0,p.color,p.floors,4.3)
    const piers=[], windows=[]
    for(let i=0;i<8;i++){
      const x=w*(i/7-.5)*.92
      piers.push([x,h*.50+.45,d/2+.27,.64,h*.86,.64])
      if(i<7)windows.push([x+w*.062,h*.24,d/2+.19,w*.082,h*.31,.18])
    }
    instances(group,piers,'#aa704c',true)
    instances(group,windows,'#516c6a')
    box(group,w+.8,.48,d+.8,0,h+.54,0,colors.pale)
    for(const sign of [-1,1]) box(group,w+.45,.47,.32,0,h+.85,sign*d*.49,'#9b9f91')
    box(group,w*.36,1.1,d*.27,-w*.15,h+1.00,-d*.25,'#a1a596')
    box(group,w*.23,.9,d*.25,w*.21,h+1.0,-d*.15,'#a7a99d')
    box(group,w*.48,.29,3.0,0,3.25,d/2+.80,colors.cream)
    box(group,w*.27,2.60,.15,0,1.50,d/2+.19,colors.dark)
    for(let i=0;i<3;i++)box(group,w*.50,.15*(3-i),.43,0,.075*(3-i),d/2+.30+i*.42,colors.concrete)
  }
  function sports(group,p) {
    if(p.d>p.w){
      const turned=new T.Group()
      turned.rotation.y=Math.PI/2
      group.add(turned)
      sports(turned,{...p,w:p.d,d:p.w})
      return
    }
    box(group,p.w,.09,p.d,0,.045,0,p.color,false)
    const line = '#f6e6c6'
    for (const x of [-p.w*.29,p.w*.28]) {
      box(group,p.w*.39,.03,.18,x,.10,-p.d*.4,line,false)
      box(group,p.w*.39,.03,.18,x,.10,p.d*.4,line,false)
      for (const offset of [-.195,0,.195]) box(group,.15,.03,p.d*.8,x+p.w*offset,.10,0,line,false)
      const circle = new T.Mesh(new T.RingGeometry(2.5,2.7,32), material(line))
      circle.rotation.x = -Math.PI/2
      circle.position.set(x,.12,0)
      group.add(circle)
      for (const sign of [-1,1]) {
        box(group,.19,3.1,.19,x+sign*p.w*.183,1.55,0,colors.metal)
        box(group,.18,.72,1.55,x+sign*p.w*.167,2.9,0,colors.pale)
      }
    }
  }
  function track(group,p) {
    const rotated=p.w>p.d
    const radius=Math.min(p.w,p.d)/2
    const tangent=Math.max(p.w,p.d)/2-radius
    const boundary=(r)=>{
      const points=[]
      for(let end=0;end<2;end++){
        const z=(end===0?1:-1)*tangent
        for(let i=0;i<=24;i++){
          const a=end*Math.PI+i*Math.PI/24
          points.push(new T.Vector2(Math.cos(a)*r,z+Math.sin(a)*r))
        }
      }
      return points
    }
    const field=new T.Group()
    if(rotated)field.rotation.y=Math.PI/2
    group.add(field)
    const oval=(radius,inner)=>{
      const shape=new T.Shape(boundary(radius))
      if(inner)shape.holes.push(new T.Path(boundary(inner)))
      return shape
    }
    const surface=(shapes,color,y)=>{
      const mesh=new T.Mesh(new T.ShapeGeometry(shapes),material(color))
      mesh.rotation.x=-Math.PI/2
      mesh.position.y=y
      mesh.receiveShadow=true
      field.add(mesh)
    }
    surface(oval(radius),'#b46e54',.336)
    const lanes=Array.from({length:5},(_,i)=>{
      const r=radius-(i+1)*.63
      return oval(r,r-.074)
    })
    surface(lanes,'#ecdbc0',.367)
    surface(oval(radius-3.9),'#759965',.368)
    const width=(radius-5.3)*2, depth=(tangent+radius-10)*2
    const turf=[[],[]], marks=[], goal=[]
    for(let i=0;i<8;i++)turf[i%2].push([0,.389,depth*((i+.5)/8-.5),width,.017,depth/8])
    const paint='#e4e5c7', y=.408
    for(const side of [-1,1]){
      marks.push([side*width/2,y,0,.12,.015,depth],
        [0,y,side*depth/2,width,.015,.12],[0,y,side*(depth/2-4.7),width*.48,.015,.12])
      for(const post of [-1,1]){
        marks.push([post*width*.24,y,side*(depth/2-2.35),.1,.015,4.7])
        goal.push([post*1.95,y+.76,side*depth/2,.11,1.55,.11])
      }
      goal.push([0,y+1.52,side*depth/2,4,.10,.10])
    }
    marks.push([0,y,0,width,.015,.12])
    instances(field,turf[0],'#819f69')
    instances(field,turf[1],'#749661')
    instances(field,marks,paint)
    instances(field,goal,'#eae5d3')
    const circle=new T.Mesh(new T.RingGeometry(2.25,2.35,32),material(paint))
    circle.rotation.x=-Math.PI/2
    circle.position.y=.427
    field.add(circle)
  }
  function build(p) {
    const group = new T.Group()
    group.position.set(p.x,0,p.z)
    group.rotation.y = T.MathUtils.degToRad(p.angle)
    group.userData.place = p.id
    const { w,d,h,floors } = p
    if (p.style === 'complex') complex(group,p)
    else if (p.style === 'annex') annex(group,p)
    else if (p.style === 'canteen' && h>0) canteen(group,p)
    else if (p.style === 'court') { group.position.y=.30; sports(group,p) }
    else if (p.style === 'track') track(group,p)
    else if (h > 0) {
      block(group,w,h,d,0,0,0,p.color,floors,p.style === 'hall' ? 8 : 4.5)
      if (p.style === 'hall') {
        box(group,w+.8,.38,d+.8,0,h+.18,0,'#b9bdb3')
        box(group,w*.64,.73,d*.73,-w*.10,h+.59,-d*.04,'#a6b8b2')
        const ribs=Array.from({length:8},(_,i)=>[w*(i/12-.39),h+.995,-d*.04,.12,.038,d*.72])
        instances(group,ribs,'#e0e2d6')
      } else if (p.style === 'dorm') {
        box(group,w+.5,.26,d+.5,0,h+.12,0,colors.cream)
        box(group,w*.88,.38,d*.81,0,h+.38,0,colors.roof)
        box(group,w*.16,.68,d*.23,-w*.24,h+.76,-d*.19,'#757f74')
        box(group,w*.22,h*.93,.35,w*.32,h*.47,d/2+.22,'#a2a89a')
        box(group,w*.24,.25,1.43,0,2.62,d/2+.46,colors.cream)
        const shelves=Array.from({length:Math.max(0,floors-1)},(_,i)=>[0,h*(i+1)/floors,d/2+.19,w*.61,.16,.53])
        instances(group,shelves,'#cdd0c1',true)
      }
      else {
        box(group,w+1,.6,d+1,0,h+.22,0,colors.cream)
        box(group,w*.40,1.15,d*.22,0,h+.65,-d*.18,colors.trim)
      }
      box(group,p.style === 'canteen' ? w*.42 : w*.2,.3,2.1,0,3.1,d/2+.5,colors.cream)
      box(group,w*.13,2.7,.14,0,1.35,d/2+.1,colors.dark)
      if (p.style === 'dorm') {
        const bands = Array.from({length:floors-1},(_,i) => [0,h*(i+1)/floors,d/2+.08,w,.19,.24])
        instances(group,bands,colors.cream)
      }
    } else {
      const marker = new T.Mesh(new T.CylinderGeometry(1.45,1.45,.27,6), material(p.color))
      marker.position.y = .25
      group.add(marker)
      box(group,.28,2.8,.28,0,1.4,0,colors.dark)
      box(group,2.3,.75,.26,0,2.69,0,p.color)
    }
    world.add(group)
    return group
  }

  return { box, material, build, instances, color:semanticColor }
}
