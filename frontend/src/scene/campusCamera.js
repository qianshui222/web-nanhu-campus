import * as T from 'three'

const up=new T.Vector3(0,1,0)
const oblique=new T.Vector3(.64,.63,.81).normalize()

export function overviewFrame(scene,aspect,fov,overhead=false){
  const perimeter=(scene.boundary??[]).concat(scene.places)
  if(!perimeter.length)return {target:new T.Vector3(),position:new T.Vector3(240,230,271)}
  const box=new T.Box3()
  perimeter.forEach(({x,z})=>box.expandByPoint(new T.Vector3(x,0,z)))
  const target=box.getCenter(new T.Vector3())
  const altitude=Math.max(25,...scene.places.map(p=>p.h||0))
  const dir=overhead?new T.Vector3(0,1,.0004).normalize():oblique
  const right=new T.Vector3().crossVectors(up,dir).normalize()
  const vertical=new T.Vector3().crossVectors(dir,right).normalize()
  const f=Math.tan(T.MathUtils.degToRad(fov)/2)
  let distance=140
  for(const x of [box.min.x,box.max.x])for(const y of [0,altitude])for(const z of [box.min.z,box.max.z]){
    const v=new T.Vector3(x,y,z).sub(target)
    distance=Math.max(distance,v.dot(dir)+Math.abs(v.dot(right))/(f*aspect*.86),
      v.dot(dir)+Math.abs(v.dot(vertical))/(f*.81))
  }
  return {target,position:target.clone().addScaledVector(dir,distance)}
}
