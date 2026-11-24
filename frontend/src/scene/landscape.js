import * as T from 'three'
import { overWater } from './terrain.js'
import { campusWater } from './campusWater.js'
import { populateCanopy } from './campusPlants.js'
import { roadPoints, roadSurface } from './roads.js'

const outline = [[-115,126],[-120,64],[-107,15],[-84,-60],[-36,-111],
  [52,-150],[107,-144],[143,-126],[151,-91],[145,-50],[117,12],[104,64],[91,117],[63,146],[-40,144]]
  .map(([x,z])=>({x,z}))

function shape(points) {
  const result=new T.Shape()
  points.forEach((point,i)=>i ? result.lineTo(point.x,-point.z) : result.moveTo(point.x,-point.z))
  result.closePath()
  return result
}

function roadTransform(a,b,w,h,y,offset=0) {
  const dx=b.x-a.x, dz=b.z-a.z, length=Math.hypot(dx,dz)
  return [(a.x+b.x)/2+offset*dz/length,y,(a.z+b.z)/2-offset*dx/length,w,h,length+.1,Math.atan2(dx,dz)]
}

const local = (x,z,p)=>{
  const angle=T.MathUtils.degToRad(p.angle)
  return [Math.cos(angle)*(x-p.x)-Math.sin(angle)*(z-p.z),Math.sin(angle)*(x-p.x)+Math.cos(angle)*(z-p.z)]
}

const streetFurnishings = new Set([
  'A--B','A--W','B--C','C--D','D--L','L--Q','Q--P','P1--P','Q--complex-in',
  'J--K','K--H1','H1--H2','H2--R','X--court-in','west-in--U'
])

function setback(x,z,roads) {
  return roads.some(({a,b,width})=>{
    const dx=b.x-a.x,dz=b.z-a.z
    const t=T.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1)
    return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<width/2+.85
  })
}

function applyShoreBand(parent, models, shore) {
  const edge=[], rim = []
  for(let i=0;i<shore.length;i++){
    const a=shore[i],b=shore[(i+1)%shore.length]
    edge.push(roadTransform(a,b,1.6,.33,.28))
    rim.push(roadTransform(a,b,.57,.075,.398))
  }
  models.instances(parent,edge,'#557f71')
  models.instances(parent,rim,'#a2ae83')
}

export function buildLandscape(world, models, scene) {
  const { material, instances }=models
  const boundary=scene.boundary?.length ? scene.boundary : outline
  const land=new T.Mesh(new T.ExtrudeGeometry(shape(boundary),{
    depth:4,bevelEnabled:true,bevelSegments:2,bevelSize:1.25,bevelThickness:.55,steps:1
  }),[material('#8b9d74'),material('#6b8373')])
  land.rotation.x=-Math.PI/2
  land.position.y=-4.25
  land.receiveShadow=true
  world.add(land)

  let water
  if (scene.water?.length) {
    water=campusWater(scene.water)
    world.add(water)
    applyShoreBand(world,models,scene.water)
  }

  const node=Object.fromEntries(scene.nodes.map(n=>[n.id,n]))
  const edgeDetail=[], paved=[], curb=[], walks=[], closed=[], steps=[], lamps=[], heads=[], glow=[], roadSegments=[]
  const rotated=(x,z,a,u,v)=>[x+Math.cos(a)*u+Math.sin(a)*v,z-Math.sin(a)*u+Math.cos(a)*v]
  const insidePlace=(x,z,margin)=>scene.places.some(p=>{
    if(!p.w || !p.d)return false
    const [u,v]=local(x,z,p)
    return Math.abs(u)<p.w/2+margin && Math.abs(v)<p.d/2+margin
  })
  const safeLand=(x,z,margin)=>overWater(boundary,x,z)&&!overWater(scene.water,x,z)&&!insidePlace(x,z,margin)
  const joins={paved:[],walks:[],closed:[],curb:[]}
  const corridors=new Set(['A--B','B--C','C--D','D--L','L--Q','Q--P','A--W','W--P','P--M','M--S','K--S',
    'W2--J','J--K','K--H1','H1--H2','H2--R','X--court-in','west-in--U','U--V'])
  for(const e of scene.edges){
    if(e.walkable===false) continue
    const line=roadPoints(e,node)
    const width=e.width ?? (corridors.has(e.id)?4.9:2.65)
    const surface=e.open?(width>4?'paved':'walks'):'closed'
    const bank=surface==='paved'?paved:surface==='walks'?walks:closed
    for(const point of line) {
      joins[surface].push({point,width})
      joins.curb.push({point,width:width+.7})
    }
    for(let j=1;j<line.length;j++){
      const a=line[j-1], b=line[j], length=Math.hypot(b.x-a.x,b.z-a.z)
      roadSegments.push({a,b,width})
      curb.push(roadTransform(a,b,width+.7,.25,.205))
      bank.push(roadTransform(a,b,width,.16,roadSurface-.08))
      if(e.open&&width>3.9&&length>5){
        for(const side of [-1,1])edgeDetail.push(roadTransform(a,b,.10,.012,roadSurface+.008,side*(width*.5-.21)))
      }
      if(e.stairs){
        for(let i=1;i<=6;i++){
          const t=i/7
          steps.push([a.x+(b.x-a.x)*t,.404,a.z+(b.z-a.z)*t,width,.09,.24,Math.atan2(b.x-a.x,b.z-a.z)])
        }
      }
    }
    if(!streetFurnishings.has(e.id))continue
    let remaining=8
    const side=['A--B','Q--P','J--K','X--court-in'].includes(e.id)?-1:1
    for(let j=1;j<line.length;j++){
      const a=line[j-1],b=line[j],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz)
      const off=(width/2+1.23)*side
      while(remaining<length){
        const x=a.x+(dx*remaining+dz*off)/length, z=a.z+(dz*remaining-dx*off)/length
        if(safeLand(x,z,1.25)){
          const angle=Math.atan2(dx,dz)
          lamps.push([x,1.89,z,.13,3.09,.13],[x,.43,z,.29,.29,.29])
          heads.push([x,3.44,z,.71,.10,.34,angle],[x,3.51,z,.52,.067,.24,angle])
          glow.push([x,3.36,z,.54,.08,.21,angle])
        }
        remaining+=17
      }
      remaining-=length
    }
  }
  const colors={paved:'#697a78',walks:'#adad95',closed:'#b87964',curb:'#b8bca9'}
  for(const [key,rows] of Object.entries(joins)){
    if(!rows.length) continue
    const mesh=new T.InstancedMesh(new T.CylinderGeometry(1,1,.12,12),material(colors[key]),rows.length)
    const placement=new T.Object3D()
    rows.forEach(({point,width},i)=>{
      placement.position.set(point.x,key==='curb' ? .275 : roadSurface-.06,point.z)
      placement.scale.set(width/2,1,width/2)
      placement.updateMatrix()
      mesh.setMatrixAt(i,placement.matrix)
    })
    mesh.receiveShadow=true
    world.add(mesh)
  }
  instances(world,curb,'#b8bca9')
  instances(world,paved,'#697a78')
  instances(world,walks,'#adad95')
  instances(world,closed,'#b87964')
  instances(world,steps,'#c4bda6')
  instances(world,edgeDetail,'#e1d4b8')
  instances(world,lamps,'#4b5d56',true)
  instances(world,heads,'#526b62')
  instances(world,glow,'#e8debb')

  const surfaces=[], borders=[], paving=[], seats=[], legs=[], hedges=[], rows=[]
  const plaza=(x,z,w,d,angle=0)=>{
    const place=(list,u,y,v,width,h,depth)=>{
      const [px,pz]=rotated(x,z,angle,u,v)
      list.push([px,y,pz,width,h,depth,angle])
    }
    place(borders,0,.312,0,w+.42,.038,d+.42)
    place(surfaces,0,.337,0,w,.035,d)
    for(let u=-w/2+1.9;u<w/2-.25;u+=2.6)place(paving,u,.357,0,.042,.015,d-.25)
    for(let v=-d/2+1.65;v<d/2-.25;v+=2.6)place(paving,0,.357,v,w-.25,.015,.041)
    for(const side of [-1,1]){
      const u=side*(w/2+.75),v=-d*.25
      const [px,pz]=rotated(x,z,angle,u,v)
      if(!safeLand(px,pz,1.7)||setback(px,pz,roadSegments))continue
      place(hedges,u,.58,v,.82,.44,d*.32)
      place(seats,u-side*.82,.71,v,.56,.11,1.62)
      place(seats,u-side*.59,.98,v,.10,.40,1.62)
      for(const off of [-.55,.55])place(legs,u-side*.82,.52,v+off,.40,.33,.12)
    }
  }
  const complex=scene.places.find(p=>p.id==='complex')
  const annex=scene.places.find(p=>p.id==='library'&&p.style==='annex')
  const food=scene.places.find(p=>p.id==='canteen')
  if(complex){
    plaza(complex.x-29,complex.z+complex.d/2+23,27,27)
    for(let i=0;i<4;i++){
      const x=complex.x-43+i*8
      rows.push([x,complex.z+complex.d/2+11,3.3],[x,complex.z+complex.d/2+29,3.5])
    }
  }
  if(annex)plaza(annex.x+2.4,annex.z+annex.d/2+7.2,27,11)
  if(food){
    const angle=T.MathUtils.degToRad(food.angle)
    const [x,z]=rotated(food.x,food.z,angle,food.asset?.doorOffset??0,food.d/2+4.3)
    plaza(x,z,Math.min(food.w*.69,25),7.6,angle)
    for(let i=0;i<5;i++)rows.push([food.x-food.w/2+i*7,food.z+food.d/2+14,3.1])
  }
  instances(world,borders,'#858c7b')
  instances(world,surfaces,'#c1baa1')
  instances(world,paving,'#968f77')
  instances(world,hedges,'#617c52')
  instances(world,seats,'#936a46')
  instances(world,legs,'#465a50')

  // The two courtyard planting areas follow the clear spaces in the GIS view.
  // Keep the schematic planting inside the yards and out of the navigable lanes.
  const groves=[
    {x:37,z:-48,w:20,d:27,color:'#809a70',trees:[[30,-56],[43,-54],[30,-43],[43,-39]]},
    {x:105,z:-49,w:14,d:21,color:'#7b9167',trees:[[100,-56],[108,-52],[102,-43],[110,-40]]},
    {x:29,z:-8,w:17,d:13,color:'#83996f',trees:[[23,-10],[34,-4]]}
  ]
  for(const grove of groves){
    const {x,z,w,d,color,trees}=grove
    const [a,b]=[w/2,d/2]
    const path=[[-a,-b+2.4],[-a+3,-b],[a-2,-b],[a,-b+3],[a,b-2.5],[a-3,b],[-a+2,b],[-a,b-3]]
      .map(([u,v])=>({x:x+u,z:z+v}))
    if(path.some(p=>!safeLand(p.x,p.z,.3)||setback(p.x,p.z,roadSegments)))continue
    const lawn=new T.Mesh(new T.ShapeGeometry(shape(path)),material(color))
    lawn.rotation.x=-Math.PI/2
    lawn.position.y=.319
    lawn.receiveShadow=true
    world.add(lawn)
    trees.forEach(([tx,tz],i)=>rows.push([tx,tz,4.2+i%2*.74]))
  }

  const treeRows=[
    [[-104,46],[-108,79],7,4.3], [[-90,-32],[-68,-73],8,5.6],
    [[-67,-73],[3,-129],13,5.5], [[30,-128],[106,-127],12,5.0],
    [[120,-118],[139,-48],12,4.3], [[22,-7],[31,28],7,4.9],
    [[-43,26],[-21,54],7,4.0], [[-14,105],[7,124],6,5.0],
    [[-84,117],[-23,127],10,5.1], [[113,-12],[90,50],10,4.4],
    [[-76,29],[-54,34],5,4.3], [[18,-50],[38,-35],5,4.1]
  ]
  for(const [start,end,count,height] of treeRows){
    for(let i=0;i<count;i++){
      const u=i/(count-1)
      rows.push([T.MathUtils.lerp(start[0],end[0],u),T.MathUtils.lerp(start[1],end[1],u),height])
    }
  }
  const trunks=[], shrubs=[[],[],[]], foliage=[[],[],[]]
  for(const [i,[x,z,base]] of rows.entries()){
    if(!safeLand(x,z,2.4)||setback(x,z,roadSegments)) continue
    const h=base*(.86+(i*13%7)/19), tone=i%foliage.length
    trunks.push([x,h*.35+.28,z,.24,h*.70,.24])
    foliage[tone].push([x,h*.91+.25,z,h*.43,h*.43,i*.81])
    foliage[(tone+1)%3].push([x+h*.19,h*.97+.25,z+h*.09,h*.29,h*.32,i*.61])
    const sx=x-h*.37,sz=z+h*.22
    if(i%3===1&&safeLand(sx,sz,1.6)&&!setback(sx,sz,roadSegments)){
      shrubs[tone].push([sx,.78,sz,.92,.60,i*.47],[sx-.75,.63,sz+.22,.64,.41,i*.19])
    }
  }
  instances(world,trunks,'#6c6651')
  const updatePlants=populateCanopy(world,models,foliage,shrubs)
  return { updatePlants, updateWater:water?.userData.tick }
}
