import * as T from 'three'

export function campusShadows(light){
  const direction=new T.Vector3(), lastDirection=new T.Vector3(), target=new T.Vector3()
  let lastExtent=0,lastSize=0
  return (mode,eye,focus,sun,profile,scene)=>{
    if(!sun)return false
    direction.set(sun.x,Math.max(.025,sun.y),sun.z).normalize()
    const local=mode==='walk' || mode==='focus' && eye.distanceTo(focus)<170
    const center=mode==='walk'?eye:focus
    const extent=local?(mode==='walk'?55:103):Math.max(202,...(scene.boundary??[]).map(p=>Math.hypot(p.x-focus.x,p.z-focus.z)+15))
    const size=local?profile.closeShadow:profile.shadow
    if(Math.abs(extent-lastExtent)<.5&&size===lastSize&&Math.hypot(target.x-center.x,target.z-center.z)<2.7&&lastDirection.distanceTo(direction)<.0025)return false
    target.set(center.x,0,center.z)
    lastDirection.copy(direction)
    lastExtent=extent
    light.target.position.copy(target)
    light.position.copy(target).addScaledVector(direction,230)
    if(lastSize!==size){
      light.shadow.map?.dispose()
      light.shadow.map=null
      light.shadow.mapSize.set(size,size)
      lastSize=size
    }
    Object.assign(light.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:2,far:500})
    light.shadow.camera.updateProjectionMatrix()
    light.shadow.normalBias=local?.13:.205
    return true
  }
}
