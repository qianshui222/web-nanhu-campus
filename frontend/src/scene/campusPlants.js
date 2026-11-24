import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

function crown(kind, detailed) {
  const pieces=[]
  const add=(g,x,y,z,sx,sy,sz)=>{
    g.scale(sx,sy,sz)
    g.translate(x,y,z)
    pieces.push(g)
  }
  if(kind===0){
    add(new T.IcosahedronGeometry(1,detailed?1:0),0,.05,0,1,.74,.94)
    if(detailed){
      add(new T.IcosahedronGeometry(1,0),-.53,-.09,.13,.63,.55,.65)
      add(new T.IcosahedronGeometry(1,0),.49,-.13,-.12,.61,.53,.62)
    }
  }else if(kind===1){
    add(new T.DodecahedronGeometry(1,0),0,-.20,0,.95,.62,.91)
    if(detailed)add(new T.IcosahedronGeometry(1,0),-.10,.37,.04,.73,.66,.78)
  }else{
    add(new T.IcosahedronGeometry(1,detailed?1:0),0,.12,0,.68,1.05,.67)
    if(detailed)add(new T.DodecahedronGeometry(1,0),.18,-.30,-.10,.69,.54,.62)
  }
  const result=mergeGeometries(pieces)
  pieces.forEach(g=>g.dispose())
  return result
}

export function populateCanopy(world,models,rows,shrubs){
  const placement=new T.Object3D(), levels=[]
  const paints=['#416e56','#6d976b','#8aa27a']
  function batch(geometry,paint,entries,shadow){
    if(!entries.length){geometry.dispose();return null}
    const mesh=new T.InstancedMesh(geometry,models.material(paint),entries.length)
    entries.forEach(([x,y,z,r,h,angle],i)=>{
      placement.position.set(x,y,z)
      placement.rotation.set(0,angle,0)
      placement.scale.set(r,h,r)
      placement.updateMatrix()
      mesh.setMatrixAt(i,placement.matrix)
    })
    mesh.computeBoundingSphere()
    mesh.castShadow=shadow
    mesh.receiveShadow=true
    world.add(mesh)
    return mesh
  }
  for(const [i,entries] of rows.entries()){
    if(!entries.length)continue
    const far=batch(crown(i,false),paints[i],entries,true)
    const near=batch(crown(i,true),paints[i],entries,true)
    near.visible=false
    levels.push({far,near})
  }
  batch(new T.DodecahedronGeometry(1,0),'#617c52',shrubs.flat(),false)
  let near=false
  return distance=>{
    const next=near?distance<195:distance<172
    if(next===near)return false
    near=next
    for(const level of levels){level.far.visible=!near;level.near.visible=near}
    return true
  }
}
