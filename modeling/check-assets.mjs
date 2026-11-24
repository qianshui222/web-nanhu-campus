import * as fs from 'node:fs'
import { createHash } from 'node:crypto'
import { strict as assert } from 'node:assert'

const project = new URL('../',import.meta.url)
const read = path => fs.readFileSync(new URL(path,project))
const json = path => JSON.parse(read(path))
const assets = json('modeling/manifest.json')
const scene = json('backend/src/main/resources/scene.json')
const previous = json('backend/src/main/resources/scene-v4.json')
const physical = scene.places.filter(p=>p.h>0)
const placeMap = s => new Map(s.places.map(p=>[p.id,p]))
const ids = new Set(assets.assets.map(a=>a.buildingId))
assert.equal(ids.size,physical.length)
assert.deepEqual(scene.places.map(p=>[p.id,p.name,p.entry]),previous.places.map(p=>[p.id,p.name,p.entry]))
assert.equal(scene.calibration.metersPerUnit,previous.calibration.metersPerUnit)
assert.deepEqual(scene.water,previous.water)
assert.deepEqual(scene.boundary,previous.boundary)
for(const edge of previous.edges)assert(scene.edges.some(e=>e.id===edge.id))
assert.deepEqual(scene.places.filter((p,i)=>['x','z','w','d','h','angle'].some(k=>p[k]!==previous.places[i][k])).map(p=>p.id).sort(),
 ['canteen','d1','d15','d2','hall'])
const stamp=[]
for(const p of physical) {
  const asset = assets.assets.find(a=>a.buildingId===p.id)
  assert(asset,p.id)
  assert.equal(asset.model,p.asset.model)
  assert.equal(asset.verification,p.asset.status)
  const bytes = read('frontend/public'+asset.model)
  assert.equal(bytes.toString('ascii',0,4),'glTF')
  assert.equal(bytes.readUInt32LE(4),2)
  assert.equal(bytes.readUInt32LE(8),bytes.length)
  assert.equal(bytes.length,asset.bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256)
  const header=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)))
  assert(header.asset.generator.includes('Blender'))
  assert(header.extensionsRequired.includes('KHR_draco_mesh_compression'))
  const root=header.nodes.find(n=>n.extras?.buildingId===p.id)
  assert(root,'No buildingId for '+p.id)
  assert.deepEqual(root.extras.dimensions,[p.w,p.h,p.d])
  assert.equal(root.extras.front,asset.facade)
  assert(!root.translation&&!root.rotation&&!root.scale,p.id+' root should be local identity')
  const primitives=header.meshes.flatMap(m=>m.primitives)
  assert(primitives.some(p=>p.attributes.COLOR_0!==undefined))
  assert.equal(header.images?.length??0,0)
  const triangles=primitives.reduce((n,p)=>n+header.accessors[p.indices].count/3,0)
  const editable = read(asset.source)
  assert(editable.length>2000)
  stamp.push({...asset,sourceBytes:editable.length,triangles,meshes:header.meshes.length,
    stages:['已生成','已接入清单','通过 GLB 结构检查']})
}

function corners(p){
  const a=p.angle*Math.PI/180, c=Math.cos(a), s=Math.sin(a)
  return [[-p.w/2,-p.d/2],[p.w/2,-p.d/2],[p.w/2,p.d/2],[-p.w/2,p.d/2]].map(([x,z])=>[p.x+c*x+s*z,p.z-s*x+c*z])
}
function pointToSegment([x,z],[ax,az],[bx,bz]){
  const dx=bx-ax,dz=bz-az
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)))
  return Math.hypot(x-ax-t*dx,z-az-t*dz)
}
function footprintsOverlap(a,b){
  for(const points of [a,b])for(let i=0;i<2;i++){
    const x=points[i+1][1]-points[i][1],z=points[i][0]-points[i+1][0]
    const first=a.map(p=>p[0]*x+p[1]*z),second=b.map(p=>p[0]*x+p[1]*z)
    if(Math.max(...first)<Math.min(...second)||Math.max(...second)<Math.min(...first))return false
  }
  return true
}
function distances(data,first,second,edge){
  const map=placeMap(data), a=map.get(first),b=map.get(second)
  const A=corners(a),B=corners(b)
  const minimum=(p,q)=>Math.min(...p.flatMap(v=>q.map((j,i)=>pointToSegment(v,j,q[(i+1)%q.length]))))
  const gap=footprintsOverlap(A,B)?0:Math.min(minimum(A,B),minimum(B,A))
  const round=n=>+n.toFixed(2)
  return {centers:round(Math.hypot(a.x-b.x,a.z-b.z)),walls:round(gap),
    roadWidth:edge ? data.edges.find(e=>e.id===edge)?.width ?? null : null}
}
const distancePairs=[
  ['d1','d2',null],['d2','d3',null],['d1','complex','N1--N2'],
  ['canteen','d15','M--canteen-in'],['canteen','d4','W2--D4J'],['hall','d15','J--K']
].map(([a,b,e])=>({a,b,nearbyCorridor:e,before:distances(previous,a,b,e),after:distances(scene,a,b,e)}))
const report={units:'scene units',blender:assets.blender,
  glbBytes:stamp.reduce((sum,n)=>sum+n.bytes,0),sourceBytes:stamp.reduce((sum,n)=>sum+n.sourceBytes,0),
  assetTriangles:stamp.reduce((sum,n)=>sum+n.triangles,0),distancePairs,assets:stamp}
if(process.argv.includes('--write'))fs.writeFileSync(new URL('docs/assets/catalog.json',project),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({ ...report,assets:stamp.length},null,2))
